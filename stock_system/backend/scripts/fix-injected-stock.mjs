#!/usr/bin/env node
/**
 * fix-injected-stock.mjs
 *
 * แก้ไข stockOnHand ที่ผิดพลาดจากบั๊ก "รับของทับ preorder แล้วไม่หักลบ backorder"
 *
 * วิธีตรวจ: Chain-Gap
 *   - เดิน StockMovement เรียงตาม createdAt
 *   - หาจุดที่ movement[i].previousStock ≠ movement[i-1].newStock
 *   - ผลต่างคือ "injectedError" ที่ถูกฉีดเข้ามาจากบั๊ก
 *   - correctStock = batchSum_ปัจจุบัน - injectedError
 *   - ภูมิคุ้มกัน cancel order (cancel กลับ batch ไม่สร้าง movement ย้อนกลับ จึงไม่เกิด gap)
 *
 * หมายเหตุ: ห้ามใช้ adjust.newStock เป็น baseline (วิธีเก่าที่พัง)
 *
 * วิธีใช้:
 *   node scripts/fix-injected-stock.mjs              ← dry-run (แสดงผลอย่างเดียว ไม่แก้ DB)
 *   node scripts/fix-injected-stock.mjs --apply      ← แก้ไข DB จริง
 *   node scripts/fix-injected-stock.mjs --sku XSR-MOM-PG-N-2XL  ← เฉพาะ SKU นั้น
 */

import { loadEnv } from '../utils/loadEnv.js';
loadEnv('../../..');

import mongoose from 'mongoose';
import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';

let uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hwp555';
if (!/authSource=/.test(uri)) uri += (uri.includes('?') ? '&' : '?') + 'authSource=admin';

const APPLY = process.argv.includes('--apply');
const SKU_FILTER = (() => {
  const idx = process.argv.indexOf('--sku');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

const DRY_RUN = !APPLY;

// ============================================================
// ลด injectedError ออกจาก batches
// injectedError > 0 = สต็อกเกิน → ลด FIFO (เก่า→ใหม่)
// injectedError < 0 = สต็อกขาด  → เพิ่ม batch ใหม่
// ห้ามแตะ BACKORDER- batch และ field incoming
// ============================================================
function applyCorrection(variant, injectedError) {
  if (injectedError > 0) {
    // สต็อกเกิน → ลด batch FIFO (เก่าสุดก่อน) จนครบ injectedError
    let remaining = injectedError;
    const positiveBatches = [...(variant.batches || [])]
      .filter(b => (b.quantity || 0) > 0 && !b.batchRef?.startsWith('BACKORDER-'))
      .sort((a, b) => new Date(a.receivedAt || 0) - new Date(b.receivedAt || 0));

    for (const snapshot of positiveBatches) {
      if (remaining <= 0) break;
      const batchDoc = variant.batches.id
        ? variant.batches.id(snapshot._id)
        : variant.batches.find(b => String(b._id) === String(snapshot._id));
      if (!batchDoc) continue;

      const consume = Math.min(batchDoc.quantity, remaining);
      batchDoc.quantity -= consume;
      remaining -= consume;
    }

    if (remaining > 0) {
      // batch ไม่พอให้หัก (edge case) → สร้าง correction batch ลบ
      variant.batches.push({
        batchRef: `CORRECTION-${Date.now()}`,
        supplier: 'Stock Correction - Injected Error Fix',
        cost: 0,
        quantity: -remaining,
        receivedAt: new Date(),
      });
    }
  } else if (injectedError < 0) {
    // สต็อกขาด → เพิ่ม batch ใหม่
    const positiveBatches = (variant.batches || []).filter(b => (b.quantity || 0) > 0);
    const avgCost =
      positiveBatches.length > 0
        ? positiveBatches.reduce((sum, b) => sum + (b.cost || 0), 0) / positiveBatches.length
        : variant.cost || 0;

    variant.batches.push({
      batchRef: `CORRECTION-${Date.now()}`,
      supplier: 'Stock Correction - Injected Error Fix',
      cost: Math.round(avgCost * 100) / 100,
      quantity: -injectedError,
      receivedAt: new Date(),
    });
  }
}

// ============================================================
// MAIN
// ============================================================
await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
console.log('connected\n');
console.log('='.repeat(60));
console.log('  fix-injected-stock.mjs (Chain-Gap Method)');
console.log('='.repeat(60));
console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (ไม่แก้ไข DB)' : '⚠️  APPLY (แก้ไข DB จริง)'}`);
if (SKU_FILTER) console.log(`กรอง SKU: ${SKU_FILTER}`);
console.log('');

const productQuery = SKU_FILTER ? { 'variants.sku': SKU_FILTER } : {};
const products = await Product.find(productQuery);
console.log(`พบ ${products.length} สินค้า\n`);

let totalChecked = 0;
let totalAffected = 0;
let totalFixed = 0;

for (const product of products) {
  for (const v of product.variants || []) {
    if (SKU_FILTER && v.sku !== SKU_FILTER) continue;
    totalChecked++;

    const movs = await StockMovement.find({ variantId: v._id }).sort({ createdAt: 1 }).lean();
    if (movs.length === 0) continue;

    // Chain-Gap: หา injectedError
    let injected = 0;
    const gaps = [];
    for (let i = 1; i < movs.length; i++) {
      const gap = (movs[i].previousStock || 0) - (movs[i - 1].newStock || 0);
      if (gap !== 0) {
        injected += gap;
        gaps.push({
          at: movs[i].createdAt,
          gap,
          afterType: movs[i - 1].movementType,
          afterRef: movs[i - 1].reference || '',
        });
      }
    }

    if (injected === 0) continue;

    const batchSum = (v.batches || []).reduce((s, b) => s + (b.quantity || 0), 0);
    const correctStock = batchSum - injected;
    totalAffected++;

    console.log(`❌ ${product.name} — SKU: ${v.sku}`);
    console.log(`   batchSum (ปัจจุบัน):   ${batchSum}`);
    console.log(`   injectedError:          ${injected > 0 ? '+' : ''}${injected}`);
    console.log(`   correctStock (เป้าหมาย): ${correctStock}`);
    for (const g of gaps) {
      const d = new Date(g.at).toISOString().slice(0, 16);
      console.log(`   gap ${g.gap > 0 ? '+' : ''}${g.gap} หลัง ${g.afterType} ${g.afterRef} @${d}`);
    }

    if (!DRY_RUN) {
      applyCorrection(v, injected);
      product.markModified('variants');
      totalFixed++;
      const newSum = (v.batches || []).reduce((s, b) => s + (b.quantity || 0), 0);
      console.log(`   ✅ แก้แล้ว → stockOnHand ใหม่: ${newSum}`);
    } else {
      console.log(`   💡 จะแก้: ${batchSum} → ${correctStock} (${injected > 0 ? 'ลด' : 'เพิ่ม'} ${Math.abs(injected)} ชิ้น)`);
    }
    console.log('');
  }

  if (!DRY_RUN && product.isModified()) {
    await product.save();
  }
}

console.log('='.repeat(60));
console.log('📊 สรุป');
console.log('='.repeat(60));
console.log(`  ตรวจสอบ: ${totalChecked} variants`);
console.log(`  พบผิดพลาด: ${totalAffected} variants`);
if (!DRY_RUN) {
  console.log(`  แก้ไขแล้ว: ${totalFixed} variants`);
} else if (totalAffected > 0) {
  console.log(`  รัน --apply เพื่อแก้ไข DB จริง`);
}

await mongoose.disconnect();

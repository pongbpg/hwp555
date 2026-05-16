#!/usr/bin/env node
/**
 * fix-backorder-stock.mjs
 *
 * แก้ไข stockOnHand ที่ผิดพลาดจาก Bug: "Backorder batch ถูกลบทิ้งโดยไม่หักออกจาก batch ใหม่"
 *
 * ปัญหา:
 *   - เมื่อมี Preorder (stockOnHand ติดลบ จาก BACKORDER batch) แล้วรับของ
 *   - ระบบลบ BACKORDER batch ออก แต่ไม่ได้หักจำนวนออกจาก batch ใหม่ที่รับเข้า
 *   - ผลลัพธ์: stockOnHand = ยอดที่รับทั้งหมด (เช่น 355)
 *   - แทนที่จะเป็น: ยอดรับ - ของที่ preorder ไว้ (เช่น 355 - 114 = 241)
 *
 * วิธีตรวจจับ:
 *   - Walk ผ่าน StockMovements ทีละตัว เรียงตาม createdAt
 *   - คำนวณ computed_stock โดยบวก/ลบ movement.quantity
 *   - ถ้า computed_stock ≠ variant.stockOnHand (batch sum) → พบความผิดพลาด
 *
 * วิธีใช้:
 *   node scripts/fix-backorder-stock.mjs              ← dry-run (แสดงผลอย่างเดียว ไม่แก้ DB)
 *   node scripts/fix-backorder-stock.mjs --apply      ← แก้ไข DB จริง
 *   node scripts/fix-backorder-stock.mjs --sku XSR-MOM-PG-N-2XL   ← เฉพาะ SKU นั้น
 */

import { loadEnv } from '../utils/loadEnv.js';
loadEnv('../../..');

import mongoose from 'mongoose';
import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/stock_system';

// ============================================================
// อ่าน arguments
// ============================================================
const APPLY = process.argv.includes('--apply');
const SKU_FILTER = (() => {
  const idx = process.argv.indexOf('--sku');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

const DRY_RUN = !APPLY;

// ============================================================
// Helper: คำนวณ stockOnHand จาก batches
// ============================================================
const calcBatchSum = (batches) =>
  (batches || []).reduce((sum, b) => sum + (b.quantity || 0), 0);

// ============================================================
// Logic หลัก: คำนวณ expected stock จาก StockMovements
//
// กฎ:
//   - เริ่มต้นจาก movements[0].previousStock (ยอดก่อน movement แรก)
//   - สำหรับ 'adjust': TRUST movement.newStock เป็น baseline ใหม่
//     (Adjustment คือการปรับปรุงสต็อกจากการนับจริง ต้องเชื่อถือ)
//   - สำหรับประเภทอื่น: บวก/ลบ movement.quantity เสมอ
//     (จำนวนที่ขาย/รับจริงถูกต้องเสมอ แม้ previousStock จะผิด)
// ============================================================
function computeExpectedStock(movements) {
  if (movements.length === 0) return null;

  let computed = movements[0].previousStock;

  for (const mov of movements) {
    if (mov.movementType === 'adjust') {
      // Adjustment = ผู้ใช้ตั้งค่าสต็อกตรงๆ → TRUST newStock
      computed = mov.newStock;
    } else {
      // ประเภทอื่น: quantity คือจำนวนที่เปลี่ยนแปลงจริง (ถูกต้องเสมอ)
      computed += mov.quantity;
    }
  }

  return computed;
}

// ============================================================
// แก้ไข batch quantities ให้ตรงกับ target stock
// ============================================================
function applyStockCorrection(variant, targetStock) {
  const actualStock = calcBatchSum(variant.batches);
  const delta = targetStock - actualStock; // + = ต้องเพิ่ม, - = ต้องลด

  if (delta === 0) return;

  if (delta < 0) {
    // ต้องลดสต็อก: consume จาก batch ที่มีจำนวนบวก (FIFO — เก่าสุดก่อน)
    let remaining = Math.abs(delta);

    const positiveBatches = [...variant.batches]
      .filter((b) => (b.quantity || 0) > 0)
      .sort((a, b) => new Date(a.receivedAt || 0) - new Date(b.receivedAt || 0)); // FIFO

    for (const batchSnapshot of positiveBatches) {
      if (remaining <= 0) break;
      const batchDoc = variant.batches.id
        ? variant.batches.id(batchSnapshot._id) // Mongoose subdoc
        : variant.batches.find((b) => String(b._id) === String(batchSnapshot._id));
      if (!batchDoc) continue;

      const consume = Math.min(batchDoc.quantity, remaining);
      batchDoc.quantity -= consume;
      remaining -= consume;
    }

    if (remaining > 0) {
      // batch ไม่พอให้หัก → สร้าง correction batch ลบ (edge case)
      variant.batches.push({
        batchRef: `BUGFIX-${Date.now()}`,
        supplier: 'Bug Fix - Backorder Correction',
        cost: 0,
        quantity: -remaining,
        receivedAt: new Date(),
      });
    }
  } else {
    // ต้องเพิ่มสต็อก: สร้าง correction batch ใหม่
    const avgCost =
      variant.batches.filter((b) => b.quantity > 0).reduce((sum, b) => sum + (b.cost || 0), 0) /
        Math.max(1, variant.batches.filter((b) => b.quantity > 0).length) || variant.cost || 0;

    variant.batches.push({
      batchRef: `BUGFIX-${Date.now()}`,
      supplier: 'Bug Fix - Backorder Correction',
      cost: avgCost,
      quantity: delta,
      receivedAt: new Date(),
    });
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('  fix-backorder-stock.mjs');
  console.log('  แก้ไข stockOnHand ที่ผิดพลาดจาก Backorder Bug');
  console.log('='.repeat(60));
  console.log(`\n🔧 Mode: ${DRY_RUN ? 'DRY-RUN (ไม่แก้ไข DB)' : '⚠️  APPLY (แก้ไข DB จริง)'}`);
  if (SKU_FILTER) console.log(`🔍 กรอง SKU: ${SKU_FILTER}`);
  console.log('');

  await mongoose.connect(MONGODB_URI);
  console.log('✅ เชื่อมต่อ MongoDB แล้ว\n');

  // ดึง products (ใช้ non-lean เพื่อให้แก้ไข subdoc ได้)
  const productQuery = SKU_FILTER
    ? { 'variants.sku': SKU_FILTER }
    : {};
  const products = await Product.find(productQuery);
  console.log(`📦 พบ ${products.length} สินค้า\n`);

  let totalChecked = 0;
  let totalDiscrepancies = 0;
  let totalFixed = 0;
  const report = [];

  for (const product of products) {
    for (const variant of product.variants) {
      if (SKU_FILTER && variant.sku !== SKU_FILTER) continue;

      totalChecked++;

      // ดึง movements เรียงตาม createdAt ascending
      const movements = await StockMovement.find({ variantId: variant._id })
        .sort({ createdAt: 1 })
        .lean();

      if (movements.length === 0) continue; // ไม่มี movement → ข้าม

      const expectedStock = computeExpectedStock(movements);
      const actualStock = calcBatchSum(variant.batches);

      // ความต่าง (ค่าเต็มจำนวน round เพื่อ floating point)
      const discrepancy = Math.round((actualStock - expectedStock) * 1000) / 1000;

      if (discrepancy === 0) continue; // ✅ ถูกต้อง

      totalDiscrepancies++;

      // หา movement รับเข้า (in) ที่ previousStock < 0 → คือ root cause
      const buggyReceive = movements.find(
        (m) => m.movementType === 'in' && (m.previousStock || 0) < 0
      );

      const item = {
        product: product.name,
        sku: variant.sku,
        actualStock,
        expectedStock,
        discrepancy,
        buggyReceive: buggyReceive
          ? {
              date: buggyReceive.createdAt,
              received: buggyReceive.quantity,
              previousStock: buggyReceive.previousStock,
              newStock: buggyReceive.newStock,
            }
          : null,
      };
      report.push(item);

      console.log(`❌ พบความผิดพลาด: ${product.name} - ${variant.sku}`);
      console.log(`   สต็อกจริง (batch sum):  ${actualStock}`);
      console.log(`   สต็อกที่ควรเป็น:        ${expectedStock}`);
      console.log(`   ความต่าง:               ${discrepancy > 0 ? '+' : ''}${discrepancy} (${discrepancy > 0 ? 'นับเกิน' : 'ขาด'})`);
      if (buggyReceive) {
        const d = new Date(buggyReceive.createdAt).toLocaleString('th-TH');
        console.log(
          `   ต้นเหตุ (รับของ ${d}): ก่อน=${buggyReceive.previousStock}, รับ=+${buggyReceive.quantity}, หลัง=${buggyReceive.newStock}`
        );
      }

      if (!DRY_RUN) {
        applyStockCorrection(variant, expectedStock);
        product.markModified('variants');
        totalFixed++;
        console.log(`   ✅ แก้ไขแล้ว → สต็อกใหม่: ${calcBatchSum(variant.batches)}`);
      } else {
        console.log(`   💡 จะแก้ไข: ${actualStock} → ${expectedStock} (ต้อง ${discrepancy > 0 ? 'ลด' : 'เพิ่ม'} ${Math.abs(discrepancy)} ชิ้น)`);
      }

      console.log('');
    }

    if (!DRY_RUN && product.isModified()) {
      await product.save();
    }
  }

  // ============================================================
  // สรุปผล
  // ============================================================
  console.log('='.repeat(60));
  console.log('📊 สรุป');
  console.log('='.repeat(60));
  console.log(`  ตรวจสอบทั้งหมด:   ${totalChecked} variants`);
  console.log(`  พบความผิดพลาด:    ${totalDiscrepancies} variants`);

  if (DRY_RUN) {
    console.log(`  แก้ไข (dry-run):  ยังไม่ได้แก้ไข`);
    if (totalDiscrepancies > 0) {
      console.log('\n⚠️  รัน --apply เพื่อแก้ไข DB จริง:');
      console.log('  node scripts/fix-backorder-stock.mjs --apply');
      if (SKU_FILTER) {
        console.log(`  node scripts/fix-backorder-stock.mjs --apply --sku ${SKU_FILTER}`);
      }
    }
  } else {
    console.log(`  แก้ไขแล้ว:        ${totalFixed} variants`);
    console.log('\n✅ เสร็จสิ้น — ข้อมูลใน DB ได้รับการแก้ไขแล้ว');
  }

  if (totalDiscrepancies === 0) {
    console.log('\n🎉 ไม่พบความผิดพลาด — สต็อกทุก variant ถูกต้องแล้ว');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

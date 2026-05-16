#!/usr/bin/env node
/**
 * fix-movement-chain.mjs
 *
 * แก้ไข previousStock / newStock ใน StockMovement ที่ผิดพลาด
 * จาก Bug: เมื่อรับของ (purchase receive) ที่มี Preorder ติดลบอยู่
 * ระบบตั้ง stockOnHand เป็นยอดรับ (เช่น 355) แทนที่จะเป็น ยอดรับ - ของที่ preorder (241)
 * ทำให้ Movement หลังจากนั้นมี previousStock/newStock ที่อิง "ยอดเกิน" นั้น
 *
 * วิธีแก้:
 *   Replay chain ของ movements ตาม createdAt อีกครั้งโดย:
 *   - ไม่ลำดับจากแรกสุด → ใช้ previousStock ของ movement แรกเป็นจุดเริ่มต้น
 *   - type อื่น: newStock = previousStock + quantity
 *   - type 'adjust': trust movement.newStock (คือ target ที่ user ตั้งไว้), ไม่ใช่ quantity
 *
 * วิธีใช้:
 *   node scripts/fix-movement-chain.mjs                ← dry-run (แสดงผลอย่างเดียว)
 *   node scripts/fix-movement-chain.mjs --apply        ← แก้ไข DB จริง
 *   node scripts/fix-movement-chain.mjs --sku XSR-MOM-PG-N-2XL   ← เฉพาะ SKU นั้น
 */

import { loadEnv } from '../utils/loadEnv.js';
loadEnv('../../..');

import mongoose from 'mongoose';
import StockMovement from '../models/StockMovement.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hwp555';

const APPLY   = process.argv.includes('--apply');
const SKU_IDX = process.argv.indexOf('--sku');
const SKU_FILTER = SKU_IDX !== -1 ? process.argv[SKU_IDX + 1] : null;
const DRY_RUN = !APPLY;

// ===================================================================
// Replay chain สำหรับ 1 variant
// คืนค่า list ของ movements ที่ต้องอัปเดต (พร้อมค่าใหม่)
// ===================================================================
function replayChain(movements) {
  const updates = [];

  if (movements.length === 0) return updates;

  // เริ่มจาก previousStock ของ movement แรก (ก่อน movement แรกเกิดขึ้น)
  let running = movements[0].previousStock;

  for (const mov of movements) {
    const correctPrev = running;
    let correctNew;

    let correctQty = mov.quantity; // default: quantity ไม่เปลี่ยน

    if (mov.movementType === 'adjust') {
      // Adjustment: ผู้ใช้ set ค่าสต็อกตรงๆ → trust newStock (ยอดที่ user ต้องการ)
      // แต่ quantity (delta) ต้องคำนวณใหม่จาก correctPrev เพราะ previousStock อาจผิด
      correctNew = mov.newStock;
      correctQty = Math.round((correctNew - correctPrev) * 1000) / 1000;
    } else {
      // ทุก type อื่น: newStock = previousStock + quantity (quantity บันทึกถูกต้องเสมอ)
      correctNew = correctPrev + mov.quantity;
    }

    running = correctNew;

    const prevDiff = Math.round((correctPrev - mov.previousStock) * 1000) / 1000;
    const newDiff  = Math.round((correctNew  - mov.newStock)      * 1000) / 1000;
    const qtyDiff  = Math.round((correctQty  - mov.quantity)      * 1000) / 1000;

    if (prevDiff !== 0 || newDiff !== 0 || qtyDiff !== 0) {
      updates.push({
        _id:              mov._id,
        sku:              mov.sku,
        createdAt:        mov.createdAt,
        movementType:     mov.movementType,
        // ค่าเดิม
        old_quantity:      mov.quantity,
        old_previousStock: mov.previousStock,
        old_newStock:      mov.newStock,
        // ค่าใหม่
        new_quantity:      correctQty,
        new_previousStock: correctPrev,
        new_newStock:      correctNew,
      });
    }
  }

  return updates;
}

// ===================================================================
// MAIN
// ===================================================================
async function main() {
  console.log('='.repeat(60));
  console.log('  fix-movement-chain.mjs');
  console.log('  แก้ไข previousStock/newStock ใน StockMovements');
  console.log('='.repeat(60));
  console.log(`\n🔧 Mode: ${DRY_RUN ? 'DRY-RUN (ไม่แก้ไข DB)' : '⚠️  APPLY (แก้ไข DB จริง)'}`);
  if (SKU_FILTER) console.log(`🔍 กรอง SKU: ${SKU_FILTER}`);
  console.log('');

  await mongoose.connect(MONGODB_URI);
  console.log('✅ เชื่อมต่อ MongoDB แล้ว\n');

  // ดึง variant IDs ที่ต้องการตรวจ
  const matchStage = SKU_FILTER ? { sku: SKU_FILTER } : {};
  const variantGroups = await StockMovement.aggregate([
    { $match: matchStage },
    { $group: { _id: '$variantId', sku: { $first: '$sku' } } },
  ]);

  console.log(`📊 พบ ${variantGroups.length} variants ที่มี movement\n`);

  let totalVariantsFixed  = 0;
  let totalMovementsFixed = 0;

  for (const group of variantGroups) {
    const movements = await StockMovement.find({ variantId: group._id })
      .sort({ createdAt: 1 })
      .lean();

    const updates = replayChain(movements);
    if (updates.length === 0) continue;

    totalVariantsFixed++;
    totalMovementsFixed += updates.length;

    console.log(`❌ ${group.sku} — พบ ${updates.length} movement ที่ผิด:`);
    for (const u of updates) {
      const d = new Date(u.createdAt).toLocaleString('th-TH');
      const qtyLabel = u.movementType === 'adjust'
        ? `qty: ${u.old_quantity > 0 ? '+' : ''}${u.old_quantity} → ${u.new_quantity > 0 ? '+' : ''}${u.new_quantity}`
        : `qty=${u.old_quantity > 0 ? '+' : ''}${u.old_quantity}`;
      console.log(
        `   [${d}] ${u.movementType} ${qtyLabel}` +
        `  ก่อน: ${u.old_previousStock} → ${u.new_previousStock}` +
        `  หลัง: ${u.old_newStock} → ${u.new_newStock}`
      );

      if (!DRY_RUN) {
        const setFields = {
          previousStock: u.new_previousStock,
          newStock:      u.new_newStock,
        };
        // แก้ quantity เฉพาะ adjust (ค่าอื่น quantity ถูกต้องอยู่แล้ว)
        if (u.movementType === 'adjust') {
          setFields.quantity = u.new_quantity;
        }
        await StockMovement.findByIdAndUpdate(u._id, { $set: setFields });
      }
    }
    console.log('');
  }

  // ===================================================================
  // สรุป
  // ===================================================================
  console.log('='.repeat(60));
  console.log('📊 สรุป');
  console.log('='.repeat(60));
  console.log(`  Variants ที่มีการแก้ไข: ${totalVariantsFixed}`);
  console.log(`  Movements ที่แก้ไข:     ${totalMovementsFixed}`);

  if (DRY_RUN && totalMovementsFixed > 0) {
    console.log('\n⚠️  รัน --apply เพื่อแก้ไข DB จริง:');
    console.log('  node scripts/fix-movement-chain.mjs --apply');
    if (SKU_FILTER) {
      console.log(`  node scripts/fix-movement-chain.mjs --apply --sku ${SKU_FILTER}`);
    }
  } else if (!DRY_RUN) {
    console.log('\n✅ เสร็จสิ้น — StockMovements ได้รับการแก้ไขแล้ว');
  }

  if (totalMovementsFixed === 0) {
    console.log('\n🎉 ไม่พบความผิดพลาด — Movements ทุก variant ถูกต้องแล้ว');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

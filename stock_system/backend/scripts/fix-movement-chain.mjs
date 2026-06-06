#!/usr/bin/env node
/**
 * fix-movement-chain.mjs
 *
 * แก้ previousStock / newStock ใน StockMovement ให้สายโซ่ต่อเนื่อง
 * หลังจาก fix-injected-stock.mjs แก้ batch sum ไปแล้ว
 *
 * วิธีการ:
 *   1. หาจุด gap แรก (movement[i].previousStock ≠ movement[i-1].newStock)
 *   2. จาก gap เป็นต้นไป คำนวณ prev/new ใหม่โดยใช้ quantity เดิมทุก type
 *      - quantity ของ adjust = delta จริง (user intent) ไม่ใช่ target
 *      - ห้าม trust adjust.newStock (อิงยอดเก่าที่ผิด)
 *
 * วิธีใช้:
 *   node scripts/fix-movement-chain.mjs              ← dry-run
 *   node scripts/fix-movement-chain.mjs --apply      ← แก้ไข DB จริง
 *   node scripts/fix-movement-chain.mjs --sku XSR-MOM-PG-N-2XL
 */

import { loadEnv } from '../utils/loadEnv.js';
loadEnv('../../..');

import mongoose from 'mongoose';
import StockMovement from '../models/StockMovement.js';

let uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hwp555';
if (!/authSource=/.test(uri)) uri += (uri.includes('?') ? '&' : '?') + 'authSource=admin';

const APPLY = process.argv.includes('--apply');
const SKU_IDX = process.argv.indexOf('--sku');
const SKU_FILTER = SKU_IDX !== -1 ? process.argv[SKU_IDX + 1] : null;

// ============================================================
// หา gap และคำนวณค่าที่ถูกต้องสำหรับ movements หลัง gap
// ============================================================
function buildUpdates(movements) {
  const updates = [];
  if (movements.length < 2) return updates;

  // หา gap แรก
  let gapIndex = -1;
  for (let i = 1; i < movements.length; i++) {
    if ((movements[i].previousStock || 0) !== (movements[i - 1].newStock || 0)) {
      gapIndex = i;
      break;
    }
  }
  if (gapIndex === -1) return updates;

  let running = movements[gapIndex - 1].newStock || 0;

  for (let i = gapIndex; i < movements.length; i++) {
    const m = movements[i];
    const newPrev = running;
    const newNew  = running + (m.quantity || 0); // ใช้ quantity เดิมทุก type (รวม adjust)
    running = newNew;

    if (newPrev !== (m.previousStock || 0) || newNew !== (m.newStock || 0)) {
      updates.push({
        _id: m._id,
        sku: m.sku,
        createdAt: m.createdAt,
        movementType: m.movementType,
        quantity: m.quantity,
        reference: m.reference,
        old_prev: m.previousStock,
        old_new:  m.newStock,
        new_prev: newPrev,
        new_new:  newNew,
      });
    }
  }
  return updates;
}

// ============================================================
// MAIN
// ============================================================
await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
console.log('connected\n');
console.log('='.repeat(60));
console.log('  fix-movement-chain.mjs (Chain-Gap repair)');
console.log('='.repeat(60));
console.log(`Mode: ${!APPLY ? 'DRY-RUN (ไม่แก้ไข DB)' : '⚠️  APPLY (แก้ไข DB จริง)'}`);
if (SKU_FILTER) console.log(`กรอง SKU: ${SKU_FILTER}`);
console.log('');

const matchStage = SKU_FILTER ? { sku: SKU_FILTER } : {};
const groups = await StockMovement.aggregate([
  { $match: matchStage },
  { $group: { _id: '$variantId', sku: { $first: '$sku' } } },
]);
console.log(`พบ ${groups.length} variants มี movement\n`);

let totalVariants = 0;
let totalMov = 0;

for (const g of groups) {
  const movs = await StockMovement.find({ variantId: g._id })
    .sort({ createdAt: 1 })
    .lean();

  const updates = buildUpdates(movs);
  if (updates.length === 0) continue;

  totalVariants++;
  totalMov += updates.length;

  // หา gap index เพื่อแสดง baseline
  let gapIdx = -1;
  for (let i = 1; i < movs.length; i++) {
    if ((movs[i].previousStock || 0) !== (movs[i - 1].newStock || 0)) { gapIdx = i; break; }
  }
  const baseline = gapIdx > 0 ? movs[gapIdx - 1].newStock || 0 : '?';

  console.log(`❌ ${g.sku} — ${updates.length} movements ต้องแก้ (baseline ถูกต้อง: ${baseline})`);
  for (const u of updates) {
    const d = new Date(u.createdAt).toISOString().slice(0, 16);
    console.log(`  ${d} ${u.movementType.padEnd(8)} qty=${String(u.quantity).padStart(5)}  prev: ${String(u.old_prev).padStart(5)}→${String(u.new_prev).padStart(5)}  new: ${String(u.old_new).padStart(5)}→${String(u.new_new).padStart(5)}  ${u.reference || ''}`);
  }
  const finalNew = updates[updates.length - 1].new_new;
  console.log(`  final newStock: ${finalNew}\n`);

  if (APPLY) {
    for (const u of updates) {
      await StockMovement.findByIdAndUpdate(u._id, {
        $set: { previousStock: u.new_prev, newStock: u.new_new },
      });
    }
  }
}

console.log('='.repeat(60));
console.log('📊 สรุป');
console.log('='.repeat(60));
console.log(`  Variants: ${totalVariants}  |  Movements: ${totalMov}`);
if (!APPLY && totalMov > 0) console.log('\n  รัน --apply เพื่อแก้ไข DB จริง');
if (APPLY && totalMov > 0) console.log('\n✅ แก้ไข DB เสร็จแล้ว');
if (totalMov === 0) console.log('\n🎉 ไม่พบ gap — chain ถูกต้องทั้งหมด');

await mongoose.disconnect();

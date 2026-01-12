#!/usr/bin/env node
/**
 * Fix Stock Movement previousStock (Chain-based) - แก้ค่า previousStock จาก chain ของ movements
 * 
 * วิธีแก้:
 * - ตรวจสอบแต่ละ variant สำหรับ movements ต่าง ๆ
 * - previousStock ของ movement ปัจจุบัน = newStock ของ movement ก่อนหน้า
 * - newStock ของ movement ปัจจุบัน = previousStock + quantity
 * - movement แรกของ variant ไม่แก้ (ยากที่จะรู้ว่า stockOnHand เดิมเท่าไร)
 */

import { loadEnv } from '../utils/loadEnv.js';
loadEnv('../../..');

import mongoose from 'mongoose';
import StockMovement from '../models/StockMovement.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/stock_system';

async function fixPreviousStockChainBased() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    // ดึงทุก movements เรียง by variantId และ createdAt
    const movements = await StockMovement.find()
      .sort({ variantId: 1, createdAt: 1 })
      .lean();

    console.log(`📊 Found ${movements.length} total movements\n`);

    // Group by variantId
    const byVariant = {};
    movements.forEach(mov => {
      const varId = String(mov.variantId);
      if (!byVariant[varId]) {
        byVariant[varId] = [];
      }
      byVariant[varId].push(mov);
    });

    console.log(`📦 Grouped into ${Object.keys(byVariant).length} variants\n`);

    let fixedCount = 0;
    let errorCount = 0;
    const report = [];

    // ประมวลผลแต่ละ variant
    for (const variantId of Object.keys(byVariant)) {
      const variantMovements = byVariant[variantId];
      
      // ข้ามอันแรก เนื่องจากไม่รู้ stockOnHand เริ่มแรก
      for (let i = 1; i < variantMovements.length; i++) {
        const prevMov = variantMovements[i - 1];
        const currMov = variantMovements[i];

        try {
          // ค่าที่ถูกต้อง
          const correctPreviousStock = prevMov.newStock;
          const correctNewStock = correctPreviousStock + currMov.quantity;
          
          // ตรวจสอบว่า previousStock ต่างกันหรือไม่
          if (Math.abs(currMov.previousStock - correctPreviousStock) > 0.01 ||
              Math.abs(currMov.newStock - correctNewStock) > 0.01) {
            
            report.push({
              sku: currMov.sku,
              date: new Date(currMov.createdAt).toLocaleString('th-TH'),
              type: currMov.movementType,
              oldPrev: currMov.previousStock,
              newPrev: correctPreviousStock,
              diff: currMov.previousStock - correctPreviousStock,
              qty: currMov.quantity,
              oldNew: currMov.newStock,
              expectedNew: correctNewStock,
              newDiff: currMov.newStock - correctNewStock,
            });

            // อัพเดต
            await StockMovement.updateOne(
              { _id: currMov._id },
              {
                previousStock: correctPreviousStock,
                newStock: correctNewStock
              }
            );

            fixedCount++;
          }
        } catch (err) {
          console.error(`❌ Error processing movement ${currMov._id}:`, err.message);
          errorCount++;
        }
      }
    }

    console.log(`\n✅ Fixed: ${fixedCount} movements`);
    console.log(`❌ Errors: ${errorCount}\n`);

    if (report.length > 0) {
      console.log('📋 Changed items:\n');
      console.table(report.slice(0, 50));

      if (report.length > 50) {
        console.log(`\n... and ${report.length - 50} more items\n`);
      }
    } else {
      console.log('✨ No changes needed!\n');
    }

    // สรุป
    console.log('='.repeat(80));
    console.log('Summary:');
    console.log('- Total movements:', movements.length);
    console.log('- Variants:', Object.keys(byVariant).length);
    console.log('- Fixed:', fixedCount);
    console.log('- Errors:', errorCount);
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Done!');
  }
}

console.log('🚀 Stock Movement PreviousStock Fixer (Chain-based)\n');
fixPreviousStockChainBased();

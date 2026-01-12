#!/usr/bin/env node
/**
 * Fix Stock Movement previousStock - แก้ค่า previousStock ให้ถูกต้อง
 * 
 * ปัญหา:
 * - Movement ก่อนหน้า: ... newStock = 86
 * - Movement ปัจจุบัน: previousStock = 85 ❌ (ไม่ตรง)
 * 
 * วิธีแก้:
 * - previousStock ของ movement ปัจจุบัน = newStock ของ movement ก่อนหน้า
 * - ตรวจสอบว่า previousStock + quantity = newStock ถูกต้อง
 */

import { loadEnv } from '../utils/loadEnv.js';
loadEnv('../../..');

import mongoose from 'mongoose';
import StockMovement from '../models/StockMovement.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/stock_system';

async function fixPreviousStock() {
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
      
      for (let i = 1; i < variantMovements.length; i++) {
        const prevMov = variantMovements[i - 1];
        const currMov = variantMovements[i];

        try {
          // ค่าที่ถูกต้องของ previousStock ในปัจจุบัน = newStock ของก่อนหน้า
          const correctPreviousStock = prevMov.newStock;
          
          // ตรวจสอบการคำนวณ: previousStock + quantity = newStock
          const expectedNewStock = correctPreviousStock + currMov.quantity;
          
          if (Math.abs(currMov.previousStock - correctPreviousStock) > 0.01 ||
              Math.abs(expectedNewStock - currMov.newStock) > 0.01) {
            
            // มีความแตกต่าง
            report.push({
              sku: currMov.sku,
              date: new Date(currMov.createdAt).toLocaleString('th-TH'),
              movementType: currMov.movementType,
              oldPrevStock: currMov.previousStock,
              correctPrevStock: correctPreviousStock,
              quantity: currMov.quantity,
              oldNewStock: currMov.newStock,
              expectedNewStock: expectedNewStock,
              prevMovDate: new Date(prevMov.createdAt).toLocaleString('th-TH'),
            });

            // อัพเดต
            await StockMovement.updateOne(
              { _id: currMov._id },
              { 
                previousStock: correctPreviousStock,
                newStock: expectedNewStock
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
      console.table(report.slice(0, 30));

      if (report.length > 30) {
        console.log(`\n... and ${report.length - 30} more items\n`);
      }
    } else {
      console.log('✨ No changes needed!\n');
    }

    // สรุป
    console.log('='  .repeat(80));
    console.log('Summary:');
    console.log('- Total movements:', movements.length);
    console.log('- Variants:', Object.keys(byVariant).length);
    console.log('- Fixed:', fixedCount);
    console.log('- Errors:', errorCount);
    console.log('='  .repeat(80));

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Done!');
  }
}

console.log('🚀 Stock Movement PreviousStock Fixer\n');
fixPreviousStock();

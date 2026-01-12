#!/usr/bin/env node
/**
 * Fix Stock Movement records - คำนวณ newStock ให้ถูกต้องจากข้อมูลเก่า
 * 
 * ตรรมชาติของปัญหา:
 * - ข้อมูลเก่า: newStock = previousStock + quantity (ถูกต้องตามนี้เสมอ)
 * - ค่านี้จริง ๆ ต้องดูจาก inventory order ที่เกี่ยวข้อง
 * 
 * วิธีแก้:
 * 1. ถ้า movement มี orderId → ดูจาก InventoryOrder (ได้แม่นยำ)
 * 2. ถ้าไม่มี orderId → ใช้ previousStock + quantity (ข้อมูลเดิม)
 */

import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import StockMovement from '../models/StockMovement.js';
import InventoryOrder from '../models/InventoryOrder.js';
import Product from '../models/Product.js';
import dotenv from 'dotenv';

// หา path ของ root directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');

// อ่าน .env จาก root directory
dotenv.config({ path: path.join(rootDir, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/stock_system';

async function fixMovements() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    // ดึงทุก movements ที่มี orderId (เกิดจาก order)
    const movementsWithOrder = await StockMovement.find({ orderId: { $exists: true } })
      .populate('orderId')
      .lean();

    console.log(`📊 Found ${movementsWithOrder.length} movements with orderId\n`);

    let fixedCount = 0;
    let errorCount = 0;
    const report = [];

    for (const mov of movementsWithOrder) {
      try {
        if (!mov.orderId) {
          continue;
        }

        const order = mov.orderId;
        
        // หา item ในorder ที่ตรงกับ movement นี้
        const orderItem = (order.items || []).find(
          item => String(item.variantId) === String(mov.variantId)
        );

        if (!orderItem) {
          continue;
        }

        // คำนวณค่าจริงจาก product/variant
        const product = await Product.findById(mov.productId).lean();
        if (!product) continue;

        const variant = product.variants.find(v => String(v._id) === String(mov.variantId));
        if (!variant) continue;

        // ค่าที่ถูกต้องควรจะ: previousStock + quantity
        // แต่โจทย์คือ ในเก่า ค่านี้อาจไม่ตรงกับ variant.stockOnHand จริงเพราะ batch logic
        
        // วิธีดีที่สุด: สร้าง transactions ย้อนหลัง
        // แต่ปัจจุบันเราไม่มี full history ของ batch consumption
        // จึง assume ว่า: previousStock + quantity = correct newStock
        // (เพราะในเสื้อฉันมี batches แล้ว)

        const calculatedNewStock = mov.previousStock + mov.quantity;

        if (Math.abs(calculatedNewStock - mov.newStock) > 0.01) {
          // มีความแตกต่าง
          report.push({
            sku: mov.sku,
            orderId: order.reference || order._id,
            orderType: order.type,
            previousStock: mov.previousStock,
            quantity: mov.quantity,
            oldNewStock: mov.newStock,
            calculatedNewStock,
            diff: mov.newStock - calculatedNewStock,
          });

          // อัพเดต
          await StockMovement.updateOne(
            { _id: mov._id },
            { newStock: calculatedNewStock }
          );

          fixedCount++;
        }
      } catch (err) {
        console.error(`❌ Error processing movement ${mov._id}:`, err.message);
        errorCount++;
      }
    }

    console.log(`\n✅ Fixed: ${fixedCount} movements`);
    console.log(`❌ Errors: ${errorCount}\n`);

    if (report.length > 0) {
      console.log('📋 Changed items:\n');
      console.table(report.slice(0, 20));

      if (report.length > 20) {
        console.log(`\n... and ${report.length - 20} more items\n`);
      }
    } else {
      console.log('✨ No changes needed!\n');
    }

    // สรุป
    console.log('='  .repeat(60));
    console.log('Summary:');
    console.log('- Total movements with orderId:', movementsWithOrder.length);
    console.log('- Fixed:', fixedCount);
    console.log('- Errors:', errorCount);
    console.log('='  .repeat(60));

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Done!');
  }
}

console.log('🚀 Stock Movement Fixer - ปรับข้อมูลเก่า\n');
fixMovements();

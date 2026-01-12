#!/usr/bin/env node
/**
 * Fix Stock Movement previousStock (with incoming issue) - แก้ค่า previousStock ที่รวม incoming เข้าไป
 * 
 * ปัญหา:
 * - previousStock ถูกบันทึกด้วยการรวม incoming (สต็อกสั่งยังไม่รับ) เข้าไป
 * - ควรจะเป็นเฉพาะ stockOnHand เท่านั้น
 * 
 * วิธีแก้:
 * - สำหรับ movements ที่เกิดจาก orders (มี orderId):
 *   - ดึงข้อมูล order เพื่อคำนวณ incoming ณ ขณะนั้น
 *   - คำนวณ previousStock ที่ถูกต้อง = previousStock (บันทึกไว้) - incoming ที่ผิด
 *   - ปรับ newStock ตามเพื่อให้ previousStock + quantity = newStock ถูกต้อง
 * 
 * - สำหรับ movements อื่น ๆ:
 *   - แก้ใจ previousStock = newStock ของ movement ก่อนหน้า
 */

import { loadEnv } from '../utils/loadEnv.js';
loadEnv('../../..');

import mongoose from 'mongoose';
import StockMovement from '../models/StockMovement.js';
import InventoryOrder from '../models/InventoryOrder.js';
import Product from '../models/Product.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/stock_system';

async function fixPreviousStockWithIncoming() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    // ดึงทุก movements เรียง by variantId และ createdAt
    const movements = await StockMovement.find()
      .sort({ variantId: 1, createdAt: 1 })
      .lean();

    console.log(`📊 Found ${movements.length} total movements\n`);

    // ดึง orders ทั้งหมด เพื่อ loop หา incoming status
    const orders = await InventoryOrder.find().lean();
    const ordersMap = new Map(orders.map(o => [String(o._id), o]));

    // ดึง Products เพื่อคำนวณ incoming
    const products = await Product.find().lean();
    const productsMap = new Map(products.map(p => [String(p._id), p]));

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

    // ประมวลผลแต่ละ movement
    for (const variantId of Object.keys(byVariant)) {
      const variantMovements = byVariant[variantId];
      
      for (let i = 0; i < variantMovements.length; i++) {
        const currMov = variantMovements[i];

        try {
          let correctPreviousStock;
          
          if (i === 0) {
            // Movement แรกของ variant - previousStock ควรจะ 0 (หรือ stockOnHand ที่ไม่มี movement)
            // ข้ามไปเพราะไม่มีข้อมูลก่อนหน้า
            correctPreviousStock = currMov.previousStock;
          } else {
            // Movement ไม่ใช่แรก
            const prevMov = variantMovements[i - 1];
            correctPreviousStock = prevMov.newStock;
          }

          // ถ้า movement นี้มี orderId ให้พยายามแก้ไขด้วยการ recalculate
          if (currMov.orderId) {
            const order = ordersMap.get(String(currMov.orderId));
            
            if (order && order.type !== 'purchase') {
              // สำหรับ sale/adjustment orders:
              // ที่ created order นั้น สินค้าสั่งซื้อ (incoming) อาจมี
              // ดังนั้นอาจทำให้ previousStock ที่บันทึกเกินไป
              
              // ดึง product เพื่อหา variant ด้วย
              const product = productsMap.get(String(currMov.productId));
              if (product) {
                const variant = product.variants?.find(v => String(v._id) === variantId);
                if (variant) {
                  // incoming ปัจจุบัน
                  const currentIncoming = variant.incoming || 0;
                  
                  // ส่วนต่างระหว่าง previousStock บันทึก และ correctPreviousStock
                  const incomingInPreviousStock = currMov.previousStock - correctPreviousStock;
                  
                  if (incomingInPreviousStock > 0.01) {
                    // มี incoming รวมอยู่ใน previousStock
                    report.push({
                      sku: currMov.sku,
                      date: new Date(currMov.createdAt).toLocaleString('th-TH'),
                      movementType: currMov.movementType,
                      orderId: order.reference || String(order._id),
                      oldPrevStock: currMov.previousStock,
                      correctPrevStock: correctPreviousStock,
                      incomingFound: incomingInPreviousStock,
                      quantity: currMov.quantity,
                      oldNewStock: currMov.newStock,
                      expectedNewStock: correctPreviousStock + currMov.quantity,
                    });

                    // อัพเดต
                    await StockMovement.updateOne(
                      { _id: currMov._id },
                      {
                        previousStock: correctPreviousStock,
                        newStock: correctPreviousStock + currMov.quantity
                      }
                    );

                    fixedCount++;
                  }
                }
              }
            }
          } else {
            // Movement ที่ไม่มี orderId
            if (i > 0 && Math.abs(currMov.previousStock - correctPreviousStock) > 0.01) {
              const prevMov = variantMovements[i - 1];
              const expectedNewStock = correctPreviousStock + currMov.quantity;
              
              report.push({
                sku: currMov.sku,
                date: new Date(currMov.createdAt).toLocaleString('th-TH'),
                movementType: currMov.movementType,
                orderId: 'manual',
                oldPrevStock: currMov.previousStock,
                correctPrevStock: correctPreviousStock,
                incomingFound: currMov.previousStock - correctPreviousStock,
                quantity: currMov.quantity,
                oldNewStock: currMov.newStock,
                expectedNewStock: expectedNewStock,
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

console.log('🚀 Stock Movement PreviousStock Fixer (With Incoming)\n');
fixPreviousStockWithIncoming();

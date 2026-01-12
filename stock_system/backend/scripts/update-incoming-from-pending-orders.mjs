/**
 * Script: Update incoming stock from pending purchase orders
 * ใช้สำหรับอัพเดท incoming field ของ variants จากทุก pending purchase orders
 * 
 * วิธีใช้:
 *   cd stock_system/backend
 *   npm run update:incoming
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import InventoryOrder from '../models/InventoryOrder.js';
import Product from '../models/Product.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from root directory
dotenv.config({ path: join(__dirname, '../../../.env') });

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/stock_system';
    await mongoose.connect(mongoUri);
    console.log('✅ เชื่อมต่อ MongoDB สำเร็จ');
  } catch (error) {
    console.error('❌ ไม่สามารถเชื่อมต่อ MongoDB:', error.message);
    process.exit(1);
  }
};

const updateIncomingFromOrders = async () => {
  try {
    // ดึงทุก pending purchase orders
    const pendingOrders = await InventoryOrder.find({
      type: 'purchase',
      status: 'pending',
    });

    console.log(`\n📦 พบ ${pendingOrders.length} รายการสั่งซื้อที่ค้าง (pending)\n`);

    if (pendingOrders.length === 0) {
      console.log('ไม่มีรายการสั่งซื้อที่ค้าง');
      return;
    }

    let totalUpdated = 0;
    let totalItems = 0;

    for (const order of pendingOrders) {
      console.log(`\n📋 Order: ${order.reference}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Created: ${new Date(order.createdAt).toLocaleString('th-TH')}`);

      for (const item of order.items || []) {
        try {
          const product = await Product.findById(item.productId);
          if (!product) {
            console.log(`   ❌ สินค้า ${item.productId} ไม่พบ`);
            continue;
          }

          const variant = product.variants.id(item.variantId);
          if (!variant) {
            console.log(`   ❌ Variant ${item.variantId} ไม่พบในสินค้า ${product.name}`);
            continue;
          }

          // คำนวณจำนวนที่ค้าง (ยังไม่รับ)
          const pendingQty = (item.quantity || 0) - (item.receivedQuantity || 0);

          if (pendingQty > 0) {
            const oldIncoming = variant.incoming || 0;
            variant.incoming = (variant.incoming || 0) + pendingQty;

            console.log(`   ✅ ${product.name} (${variant.sku})`);
            console.log(`      ค้างรับ: ${pendingQty} ชิ้น`);
            console.log(`      incoming เดิม: ${oldIncoming} → ใหม่: ${variant.incoming}`);

            product.markModified('variants');
            await product.save();

            totalUpdated++;
            totalItems += pendingQty;
          }
        } catch (error) {
          console.log(`   ⚠️ เกิดข้อผิดพลาด: ${error.message}`);
        }
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ อัพเดทเสร็จสิ้น`);
    console.log(`   รวม: ${totalUpdated} รายการสินค้า`);
    console.log(`   รวมค้างรับ: ${totalItems} ชิ้น`);
    console.log(`${'='.repeat(60)}\n`);
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
  } finally {
    await mongoose.connection.close();
    console.log('✅ ปิดการเชื่อมต่อ MongoDB');
  }
};

const main = async () => {
  await connectDB();
  await updateIncomingFromOrders();
};

main();

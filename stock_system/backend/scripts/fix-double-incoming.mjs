/**
 * Fix Script: แก้ SKU ที่มี double incoming
 * 
 * วิธีใช้:
 *   cd stock_system/backend
 *   node scripts/fix-double-incoming.mjs
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
    console.log('✅ เชื่อมต่อ MongoDB สำเร็จ\n');
  } catch (error) {
    console.error('❌ ไม่สามารถเชื่อมต่อ MongoDB:', error.message);
    process.exit(1);
  }
};

const fixDoubleIncoming = async () => {
  try {
    // สร้าง map ของ expected incoming จาก pending orders
    const expectedIncoming = new Map();

    const pendingOrders = await InventoryOrder.find({
      type: 'purchase',
      status: 'pending',
    }).lean();

    console.log(`📦 วิเคราะห์ ${pendingOrders.length} pending purchase orders\n`);

    for (const order of pendingOrders) {
      for (const item of order.items || []) {
        const variantId = item.variantId.toString();
        const pendingQty = (item.quantity || 0) - (item.receivedQuantity || 0);

        if (pendingQty > 0) {
          const current = expectedIncoming.get(variantId) || { qty: 0, sku: item.sku, productName: '' };
          current.qty += pendingQty;
          expectedIncoming.set(variantId, current);
        }
      }
    }

    console.log(`✅ พบ ${expectedIncoming.size} SKU ที่มี pending orders\n`);

    // ตอนนี้ลองแก้ incoming ให้ตรงกับ expected
    console.log('=' .repeat(80));
    console.log('🔧 FIXING DOUBLE INCOMING:');
    console.log('='.repeat(80));

    let fixedCount = 0;
    let totalFixed = 0;

    for (const [variantId, expected] of expectedIncoming) {
      // หาสินค้าและ variant
      const allProducts = await Product.find({
        'variants._id': new mongoose.Types.ObjectId(variantId),
      });

      for (const product of allProducts) {
        const variant = product.variants.id(variantId);
        if (!variant) continue;

        const currentIncoming = variant.incoming || 0;

        // ถ้า incoming เป็นสองเท่า ให้ลดครึ่งหนึ่ง
        if (currentIncoming === expected.qty * 2) {
          console.log(`\n✅ ${variant.sku} (${product.name})`);
          console.log(`   From: ${currentIncoming} → To: ${expected.qty} (ลด ${expected.qty} ชิ้น)`);
          
          variant.incoming = expected.qty;
          product.markModified('variants');
          await product.save();

          fixedCount++;
          totalFixed += expected.qty;
        }
        // ถ้า incoming สูงกว่า expected แต่ไม่ใช่สองเท่า ให้ใช้ expected
        else if (currentIncoming > expected.qty) {
          console.log(`\n⚠️ ${variant.sku} (${product.name})`);
          console.log(`   From: ${currentIncoming} → To: ${expected.qty} (ลด ${currentIncoming - expected.qty} ชิ้น)`);
          
          variant.incoming = expected.qty;
          product.markModified('variants');
          await product.save();

          fixedCount++;
          totalFixed += (currentIncoming - expected.qty);
        }
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ แก้ไขเสร็จสิ้น`);
    console.log(`   รวม: ${fixedCount} SKU`);
    console.log(`   ลด: ${totalFixed} ชิ้น`);
    console.log(`${'='.repeat(80)}\n`);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

connectDB().then(fixDoubleIncoming);

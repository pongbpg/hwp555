/**
 * Debug Script: ตรวจสอบ SKU ที่มี "ยอดค้างเบิ้ล" (double incoming)
 * 
 * วิธีใช้:
 *   cd stock_system/backend
 *   node scripts/debug-double-inventory.mjs
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

const debugIncoming = async () => {
  try {
    // ดึงทุก pending purchase orders
    const pendingOrders = await InventoryOrder.find({
      type: 'purchase',
      status: 'pending',
    }).lean();

    console.log(`📦 พบ ${pendingOrders.length} รายการสั่งซื้อที่ค้าง (pending)\n`);

    // สร้าง map ของ expected incoming จากตาราง orders
    const expectedIncomingFromOrders = new Map();
    let totalExpected = 0;
    let totalItems = 0;

    console.log('=' .repeat(80));
    console.log('สรุปจาก PENDING PURCHASE ORDERS:');
    console.log('='.repeat(80));

    for (const order of pendingOrders) {
      console.log(`\n📋 Order: ${order.reference} (Status: ${order.status})`);
      console.log(`   Created: ${new Date(order.createdAt).toLocaleString('th-TH')}`);

      for (const item of order.items || []) {
        const variantKey = item.variantId.toString();
        const pendingQty = (item.quantity || 0) - (item.receivedQuantity || 0);

        if (pendingQty > 0) {
          const current = expectedIncomingFromOrders.get(variantKey) || { qty: 0, sku: item.sku, orders: [] };
          current.qty += pendingQty;
          current.orders.push({
            reference: order.reference,
            ordered: item.quantity,
            received: item.receivedQuantity || 0,
            pending: pendingQty,
          });
          expectedIncomingFromOrders.set(variantKey, current);
          totalExpected++;
          totalItems += pendingQty;

          console.log(`   ✅ ${item.sku}`);
          console.log(`      Ordered: ${item.quantity}, Received: ${item.receivedQuantity || 0}, Pending: ${pendingQty}`);
        }
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`รวม: ${totalExpected} variants, ${totalItems} ชิ้น ค้างรับ`);
    console.log(`${'='.repeat(80)}\n`);

    // ตอนนี้ดึง incoming จากตาราง product
    console.log('=' .repeat(80));
    console.log('สรุปจาก DATABASE (product.variants[].incoming):');
    console.log('='.repeat(80));

    const allProducts = await Product.find();
    const actualIncoming = new Map();
    let totalActualIncoming = 0;
    let variantsWithIncoming = 0;

    for (const product of allProducts) {
      for (const variant of product.variants || []) {
        if (variant.incoming > 0) {
          actualIncoming.set(variant._id.toString(), {
            sku: variant.sku,
            incoming: variant.incoming,
            productName: product.name,
          });
          totalActualIncoming += variant.incoming;
          variantsWithIncoming++;
        }
      }
    }

    console.log(`\nFound ${variantsWithIncoming} variants with incoming > 0`);
    console.log(`Total incoming: ${totalActualIncoming} ชิ้น\n`);

    // หาความเบิ้ล
    console.log('=' .repeat(80));
    console.log('🔍 ANALYSIS - ตรวจหา DOUBLE INCOMING (MISMATCH):');
    console.log('='.repeat(80));

    const doubleIncoming = [];
    const missingIncoming = [];
    const extraIncoming = [];

    for (const [variantId, data] of expectedIncomingFromOrders) {
      const actual = actualIncoming.get(variantId);
      
      if (!actual) {
        missingIncoming.push({ sku: data.sku, expected: data.qty });
      } else if (actual.incoming > data.qty) {
        // Extra - อาจมี double
        const extra = actual.incoming - data.qty;
        doubleIncoming.push({
          sku: data.sku,
          productName: actual.productName,
          expected: data.qty,
          actual: actual.incoming,
          extra: extra,
          orders: data.orders,
        });
      } else if (actual.incoming < data.qty) {
        // Missing - อาจจ่ายลดไป
        const missing = data.qty - actual.incoming;
        missingIncoming.push({
          sku: data.sku,
          expected: data.qty,
          actual: actual.incoming,
          missing: missing,
        });
      }
    }

    // หา extra incoming ที่ไม่มี pending orders
    for (const [variantId, data] of actualIncoming) {
      if (!expectedIncomingFromOrders.has(variantId) && data.incoming > 0) {
        extraIncoming.push({
          sku: data.sku,
          productName: data.productName,
          incoming: data.incoming,
          reason: 'ไม่มี pending order ที่สอดคล้องกัน',
        });
      }
    }

    // แสดงผล DOUBLE INCOMING
    if (doubleIncoming.length > 0) {
      console.log(`\n⚠️ FOUND ${doubleIncoming.length} SKU WITH DOUBLE INCOMING:\n`);
      
      doubleIncoming.forEach((item, idx) => {
        console.log(`${idx + 1}. SKU: ${item.sku} (${item.productName})`);
        console.log(`   Expected incoming: ${item.expected} ชิ้น (จาก pending orders)`);
        console.log(`   Actual incoming:   ${item.actual} ชิ้น (ในฐานข้อมูล)`);
        console.log(`   ⚠️  EXTRA: ${item.extra} ชิ้น (${((item.extra / item.expected) * 100).toFixed(1)}% เพิ่มเติม)`);
        console.log(`   Orders:`);
        item.orders.forEach(o => {
          console.log(`      - ${o.reference}: ordered=${o.ordered}, received=${o.received}, pending=${o.pending}`);
        });
        console.log('');
      });
    } else {
      console.log('\n✅ ไม่พบ SKU ที่มี double incoming');
    }

    // แสดงผล MISSING INCOMING
    if (missingIncoming.length > 0) {
      console.log(`\n⚠️ FOUND ${missingIncoming.length} SKU WITH MISSING/REDUCED INCOMING:\n`);
      
      missingIncoming.forEach((item, idx) => {
        if (item.missing) {
          console.log(`${idx + 1}. SKU: ${item.sku}`);
          console.log(`   Expected: ${item.expected} ชิ้น`);
          console.log(`   Actual:   ${item.actual} ชิ้น`);
          console.log(`   Missing:  ${item.missing} ชิ้น\n`);
        } else {
          console.log(`${idx + 1}. SKU: ${item.sku}`);
          console.log(`   Expected: ${item.expected} ชิ้น`);
          console.log(`   ❌ Not found in database\n`);
        }
      });
    }

    // แสดงผล EXTRA INCOMING
    if (extraIncoming.length > 0) {
      console.log(`\n⚠️ FOUND ${extraIncoming.length} SKU WITH EXTRA INCOMING (no pending order):\n`);
      
      extraIncoming.forEach((item, idx) => {
        console.log(`${idx + 1}. SKU: ${item.sku} (${item.productName})`);
        console.log(`   Incoming: ${item.incoming} ชิ้น`);
        console.log(`   ⚠️  ${item.reason}\n`);
      });
    }

    // Summary
    console.log('=' .repeat(80));
    console.log('📊 SUMMARY:');
    console.log('='.repeat(80));
    console.log(`Total expected incoming from orders: ${totalItems} ชิ้น`);
    console.log(`Total actual incoming in database:  ${totalActualIncoming} ชิ้น`);
    console.log(`Discrepancy: ${totalActualIncoming - totalItems} ชิ้น ${totalActualIncoming > totalItems ? '(OVER)' : '(SHORT)'}`);
    console.log(`\nDouble incoming SKUs: ${doubleIncoming.length}`);
    console.log(`Missing/Short incoming SKUs: ${missingIncoming.length}`);
    console.log(`Extra incoming (no order): ${extraIncoming.length}`);
    console.log(`${'='.repeat(80)}\n`);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

connectDB().then(debugIncoming);

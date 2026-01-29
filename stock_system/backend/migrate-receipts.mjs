/**
 * Migration: สร้าง receipt records สำหรับ purchase orders ที่ completed แล้ว
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

const mongoUri = process.env.MONGODB_URI;

await mongoose.connect(mongoUri);

const db = mongoose.connection.db;

console.log('🔧 Starting migration: create receipts from product batches...\n');

// Step 1: ดึง purchase orders ที่ยังไม่มี receipts
const orders = await db.collection('inventoryorders').find({
  type: 'purchase',
  status: { $in: ['pending', 'completed'] },
  receipts: { $exists: false }  // ยังไม่มี receipts
}).toArray();

console.log(`Found ${orders.length} orders without receipts\n`);

// Step 2: ดึง products ทั้งหมด
const products = await db.collection('products').find({}).toArray();

let updatedCount = 0;

for (const order of orders) {
  console.log(`Processing ${order.reference}...`);
  
  const newReceipts = [];
  const receiptsByItemIndex = {}; // itemIndex -> array of receipts
  
  // Step 3: ค้นหา batches จาก products ที่มี orderId = order นี้
  for (const product of products) {
    for (const variant of product.variants || []) {
      for (const batch of variant.batches || []) {
        // ✅ ถ้า batch มี orderId ตรงกับ order นี้
        if (batch.orderId && batch.orderId.toString() === order._id.toString()) {
          // หา item index ที่ตรงกับ variantId นี้
          const itemIndex = order.items.findIndex(item => 
            item.variantId && item.variantId.toString() === variant._id.toString()
          );
          
          if (itemIndex >= 0) {
            console.log(`  ✅ Found batch: ${batch.batchRef} (${batch.quantity} qty) for item ${itemIndex}`);
            
            if (!receiptsByItemIndex[itemIndex]) {
              receiptsByItemIndex[itemIndex] = [];
            }
            
            receiptsByItemIndex[itemIndex].push({
              itemIndex,
              quantity: batch.quantity || 0,
              batchRef: batch.batchRef || `LOT${Date.now()}`,
              supplier: batch.supplier || 'Direct',
              expiryDate: batch.expiryDate || null,
              unitCost: batch.cost || 0,
              receivedAt: batch.receivedAt || new Date(order.orderDate || Date.now()),
              status: 'completed',
            });
          }
        }
      }
    }
  }
  
  // Step 4: สร้าง receipts array จากการรวมทั้งหมด
  for (let idx = 0; idx < order.items.length; idx++) {
    if (receiptsByItemIndex[idx]) {
      newReceipts.push(...receiptsByItemIndex[idx]);
    }
  }
  
  // Step 5: อัพเดท order ด้วย receipts
  if (newReceipts.length > 0) {
    // อัพเดท items ให้มี receivedQuantity
    const updatedItems = order.items.map((item, idx) => {
      const receipts = receiptsByItemIndex[idx] || [];
      const totalReceived = receipts.reduce((sum, r) => sum + (r.quantity || 0), 0);
      return {
        ...item,
        receivedQuantity: totalReceived
      };
    });
    
    await db.collection('inventoryorders').updateOne(
      { _id: order._id },
      { 
        $set: { 
          receipts: newReceipts,
          items: updatedItems
        } 
      }
    );
    updatedCount++;
    console.log(`  📝 Created ${newReceipts.length} receipts\n`);
  }
}

console.log(`\n✨ Done! Updated ${updatedCount} orders`);

await mongoose.disconnect();
process.exit(0);

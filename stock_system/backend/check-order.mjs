/**
 * Debug script: ดูรายละเอียด order ใน database
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load from root .env first, then backend .env
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

const mongoUri = process.env.MONGODB_URI;

await mongoose.connect(mongoUri);

const db = mongoose.connection.db;

// ดึง order ตามชื่อ reference
const order = await db.collection('inventoryorders').findOne({
  reference: 'PO2569-0001'
});

if (!order) {
  console.log('❌ ไม่พบ order PO2569-0001');
  process.exit(1);
}

console.log('📋 Order Details:');
console.log('================');
console.log('Reference:', order.reference);
console.log('Type:', order.type);
console.log('Status:', order.status);
console.log('Order Date:', order.orderDate);

console.log('\n📦 Items:');
console.log('================');
order.items.forEach((item, idx) => {
  console.log(`\nItem ${idx}:`);
  console.log('  SKU:', item.sku);
  console.log('  Quantity:', item.quantity);
  console.log('  ReceivedQuantity:', item.receivedQuantity);
});

console.log('\n🧾 Receipts:');
console.log('================');
if (order.receipts && order.receipts.length > 0) {
  order.receipts.forEach((receipt, idx) => {
    console.log(`\nReceipt ${idx}:`);
    console.log('  ItemIndex:', receipt.itemIndex);
    console.log('  Quantity:', receipt.quantity);
    console.log('  Status:', receipt.status);
    console.log('  BatchRef:', receipt.batchRef);
    console.log('  ReceivedAt:', receipt.receivedAt);
  });
} else {
  console.log('❌ ไม่มี receipts');
}

console.log('\n📊 Summary:');
console.log('================');
const totalReceipts = (order.receipts || []).filter(r => r.status === 'completed').length;
const totalReceivedQty = (order.receipts || [])
  .filter(r => r.status === 'completed')
  .reduce((sum, r) => sum + (r.quantity || 0), 0);

console.log('Total Receipts (completed):', totalReceipts);
console.log('Total Received Quantity:', totalReceivedQty);

await mongoose.disconnect();
process.exit(0);

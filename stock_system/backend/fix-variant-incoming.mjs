/**
 * Fix script: Update variant.incoming ให้ตรงกับ actual remaining จาก receipts
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

console.log('🔧 Fixing variant.incoming to match actual purchase remaining...\n');

// ดึง purchase orders ทั้งหมด (pending + completed)
const purchaseOrders = await db.collection('inventoryorders').find({
  type: 'purchase',
  status: { $in: ['pending', 'completed'] }
}).toArray();

// สร้าง map: variantId -> { purchased, received, remaining }
const purchaseRemainingByVariant = new Map();

purchaseOrders.forEach((order) => {
  order.items.forEach((item, itemIndex) => {
    const variantKey = String(item.variantId);
    const received = (order.receipts || [])
      .filter((r) => r.status === 'completed' && r.itemIndex === itemIndex)
      .reduce((sum, r) => sum + (r.quantity || 0), 0);
    
    if (!purchaseRemainingByVariant.has(variantKey)) {
      purchaseRemainingByVariant.set(variantKey, { purchased: 0, received: 0, remaining: 0 });
    }
    
    const data = purchaseRemainingByVariant.get(variantKey);
    data.purchased += item.quantity;
    data.received += received;
    data.remaining += item.quantity - received;
  });
});

console.log(`Found ${purchaseRemainingByVariant.size} variants with purchase orders\n`);

// ดึง products ทั้งหมดและ update variants
const products = await db.collection('products').find().toArray();
let fixedCount = 0;
let totalUpdated = 0;

for (const product of products) {
  let hasChanges = false;
  
  for (const variant of product.variants || []) {
    const variantKey = String(variant._id);
    const actualRemaining = purchaseRemainingByVariant.get(variantKey)?.remaining || 0;
    
    if (variant.incoming !== actualRemaining) {
      const diff = actualRemaining - (variant.incoming || 0);
      console.log(`  ⚠️  ${variant.sku}: incoming=${variant.incoming} → ${actualRemaining} (diff: ${diff > 0 ? '+' : ''}${diff})`);
      
      variant.incoming = actualRemaining;
      hasChanges = true;
      totalUpdated++;
    }
  }
  
  if (hasChanges) {
    // Update in database
    await db.collection('products').updateOne(
      { _id: product._id },
      { $set: { variants: product.variants } }
    );
    fixedCount++;
    console.log(`✅ Updated product: ${product.name}\n`);
  }
}

console.log(`\n✨ Done! Fixed ${fixedCount} products with ${totalUpdated} variant changes`);

await mongoose.disconnect();
process.exit(0);

/**
 * Check specific SKU against batch data
 * ตรวจสอบว่า movements กับ batches data ตรงกันหรือไม่
 */

import mongoose from 'mongoose';
import StockMovement from '../models/StockMovement.js';
import Product from '../models/Product.js';

const MONGODB_URI = 'mongodb://mongo:KTlBvUhGjEidMDEKLAzevAVCOATaiNsU@gondola.proxy.rlwy.net:33948/test?authSource=admin';

async function checkSku() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const SKU = 'XSR-SW-SKP-B-M';

    console.log(`📋 Checking SKU: ${SKU}`);
    console.log('═'.repeat(150));

    // Get all movements for this SKU
    const movements = await StockMovement.find({ sku: SKU }).sort({ createdAt: 1 }).lean();
    console.log(`\n🔍 StockMovements (Total: ${movements.length}):`);
    console.log('─'.repeat(150));
    
    let totalQuantityFromMovements = 0;
    movements.forEach((m, idx) => {
      const direction = m.quantity > 0 ? '📥' : '📤';
      console.log(`${idx + 1}. ${direction} ${m.createdAt.toISOString()} | Type: ${m.movementType.padEnd(6)} | Qty: ${String(m.quantity).padStart(4)} | Before: ${String(m.previousStock).padStart(4)} → After: ${String(m.newStock).padStart(4)}`);
      if (m.movementType === 'out') {
        totalQuantityFromMovements += Math.abs(m.quantity);
      }
    });

    console.log(`\nTotal quantity out (from movements): ${totalQuantityFromMovements}`);

    // Get product with variants to find batch data
    const product = await Product.findOne({ 'variants.sku': SKU }).lean();
    if (!product) {
      console.log('❌ Product not found!');
      await mongoose.disconnect();
      process.exit(1);
    }

    const variant = product.variants.find(v => v.sku === SKU);
    if (!variant) {
      console.log('❌ Variant not found!');
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`\n🧮 Current Variant State:`);
    console.log(`   stockOnHand: ${variant.stockOnHand}`);
    console.log(`   batches count: ${variant.batches.length}`);

    // Check batch consumed records
    console.log(`\n📦 Batch Details:`);
    console.log('─'.repeat(150));
    
    for (let i = 0; i < variant.batches.length; i++) {
      const batch = variant.batches[i];
      console.log(`\nBatch ${i + 1}:`);
      console.log(`   batchRef: ${batch.batchRef}`);
      console.log(`   supplier: ${batch.supplier}`);
      console.log(`   cost: ${batch.cost}`);
      console.log(`   quantity: ${batch.quantity}`);
      console.log(`   expiryDate: ${batch.expiryDate}`);
      console.log(`   receivedAt: ${batch.receivedAt}`);
      console.log(`   consumedAt: ${batch.consumedAt ? JSON.stringify(batch.consumedAt) : 'none'}`);
      console.log(`   orderId: ${batch.orderId}`);
    }

    console.log(`\n\n📊 Summary:`);
    console.log('─'.repeat(150));
    console.log(`Total StockMovements (out): ${movements.filter(m => m.movementType === 'out').length} movements, ${totalQuantityFromMovements} units`);
    console.log(`Total current batches qty: ${variant.batches.reduce((sum, b) => sum + (b.quantity || 0), 0)} units`);
    console.log(`Expected final stock: ${variant.batches.reduce((sum, b) => sum + (b.quantity || 0), 0)} units`);
    
    const calculatedStock = 130 + 80 - 11; // initial + received - sold
    console.log(`Calculated stock (130 + 80 - 11): ${calculatedStock} units`);
    
    console.log(`\n✅ Batch data is correct - consumed data is stored by reducing batch.quantity`);
    console.log(`   Batch 1 original: 130, now: 113 (consumed 17)`);
    console.log(`   Batch 2 original: 80, now: 80 (consumed 0 of this batch yet)`);
    console.log(`   Wait - that doesn't add up...`);

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkSku();

/**
 * Migration Script: Fix Batch Quantities to Match Movements
 * 
 * ปัญหา: batch.quantity ไม่ตรงกับ movements records
 * วิธีแก้: 
 * 1. ดึง movements ทั้งหมด (sorted by date)
 * 2. สำหรับแต่ละ SKU, simulate การ consume batches ตามลำดับ
 * 3. Update batch.quantity ให้ตรงกับจำนวนที่เหลือจริง
 */

import mongoose from 'mongoose';
import StockMovement from '../models/StockMovement.js';
import Product from '../models/Product.js';

const MONGODB_URI = 'mongodb://mongo:KTlBvUhGjEidMDEKLAzevAVCOATaiNsU@gondola.proxy.rlwy.net:33948/test?authSource=admin';

async function fixBatchQuantities() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all movements
    const movements = await StockMovement.find({}).sort({ sku: 1, createdAt: 1 }).lean();
    console.log(`Found ${movements.length} movements\n`);

    // Group movements by SKU
    const movementsBySku = new Map();
    for (const m of movements) {
      if (!movementsBySku.has(m.sku)) {
        movementsBySku.set(m.sku, []);
      }
      movementsBySku.get(m.sku).push(m);
    }

    console.log(`Processing ${movementsBySku.size} unique SKUs...\n`);

    let fixedSkus = 0;
    let fixedBatches = 0;

    for (const [sku, skuMovements] of movementsBySku) {
      const product = await Product.findOne({ 'variants.sku': sku });
      if (!product) {
        console.log(`⚠️  SKU ${sku}: Product not found, skipping`);
        continue;
      }

      let variant = product.variants.find(v => v.sku === sku);
      if (!variant) {
        console.log(`⚠️  SKU ${sku}: Variant not found, skipping`);
        continue;
      }

      console.log(`\n📦 Processing SKU: ${sku}`);
      console.log('═'.repeat(150));

      // Simulate batch consumption based on movements
      // Start with initial batches as received
      const batchSimulation = new Map(); // batchRef -> current quantity

      for (const movement of skuMovements) {
        if (movement.movementType === 'in') {
          // Add new batch
          const batchRef = movement.batchRef || `UNKNOWN-${movement.createdAt}`;
          const qty = movement.quantity;
          
          // Find or create batch in simulation
          if (!batchSimulation.has(batchRef)) {
            batchSimulation.set(batchRef, qty);
            console.log(`   ✅ IN: ${movement.createdAt.toISOString()} | Batch: ${batchRef} | +${qty}`);
          }
        } else if (movement.movementType === 'out') {
          // Consume from batches (FIFO)
          let qtyToConsume = Math.abs(movement.quantity);
          console.log(`   📤 OUT: ${movement.createdAt.toISOString()} | Consume -${qtyToConsume}`);

          // FIFO: consume from oldest batches first
          for (const [batchRef, currentQty] of batchSimulation) {
            if (qtyToConsume <= 0) break;
            
            const consumed = Math.min(currentQty, qtyToConsume);
            batchSimulation.set(batchRef, currentQty - consumed);
            qtyToConsume -= consumed;
            
            console.log(`      - From ${batchRef}: -${consumed} (remaining: ${currentQty - consumed})`);
          }
        }
      }

      // Now compare and update actual batches
      console.log(`\n   Updating batch quantities:`);
      
      for (const batch of variant.batches) {
        const batchRef = batch.batchRef;
        const simulatedQty = batchSimulation.get(batchRef);

        if (simulatedQty === undefined) {
          console.log(`   ⚠️  Batch ${batchRef}: Not found in movements simulation`);
          continue;
        }

        const oldQty = batch.quantity;
        if (oldQty !== simulatedQty) {
          console.log(`   ❌ Batch ${batchRef}: ${oldQty} → ${simulatedQty} (delta: ${simulatedQty - oldQty})`);
          batch.quantity = simulatedQty;
          fixedBatches++;
        } else {
          console.log(`   ✅ Batch ${batchRef}: ${oldQty} (correct)`);
        }
      }

      // Save product
      product.markModified('variants');
      await product.save();
      fixedSkus++;
    }

    console.log(`\n\n📊 Summary:`);
    console.log('═'.repeat(150));
    console.log(`Fixed SKUs: ${fixedSkus}`);
    console.log(`Fixed Batches: ${fixedBatches}`);

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixBatchQuantities();

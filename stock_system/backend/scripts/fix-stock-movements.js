/**
 * Migration Script: Fix Stock Movement History
 * 
 * ปัญหา: previousStock ถูกบันทึกผิด เพราะ variant.stockOnHand ไม่ update ทันที
 *       ต้อง recalculate ตามลำดับเวลา โดยให้ previousStock = newStock ของ movement ก่อนหน้า
 * 
 * วิธีแก้: 
 * 1. Sort movements by createdAt (oldest first)
 * 2. Loop แต่ละ movement โดย keep track running stock
 * 3. previousStock = running stock
 * 4. newStock = previousStock + quantity
 * 5. running stock = newStock
 * 6. Update DB
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Models
import StockMovement from '../models/StockMovement.js';

const MONGODB_URI = 'mongodb://mongo:KTlBvUhGjEidMDEKLAzevAVCOATaiNsU@gondola.proxy.rlwy.net:33948/test?authSource=admin';

async function fixStockMovements() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('📊 Fetching all stock movements sorted by SKU and date...');
    const movements = await StockMovement.find({}).sort({ sku: 1, createdAt: 1 });
    console.log(`Found ${movements.length} movements to fix\n`);

    let fixed = 0;
    let errors = 0;

    // Group movements by SKU to process each SKU separately
    const movementsBySkU = new Map();
    for (const movement of movements) {
      if (!movementsBySkU.has(movement.sku)) {
        movementsBySkU.set(movement.sku, []);
      }
      movementsBySkU.get(movement.sku).push(movement);
    }

    // Process each SKU
    for (const [sku, skuMovements] of movementsBySkU) {
      console.log(`\n📦 Processing SKU: ${sku}`);
      console.log('═'.repeat(150));

      let runningStock = 0; // Start from 0

      for (const movement of skuMovements) {
        try {
          const correctPreviousStock = runningStock;
          const calculatedNewStock = correctPreviousStock + (movement.quantity || 0);

          // Check if needs fixing
          if (movement.previousStock !== correctPreviousStock || movement.newStock !== calculatedNewStock) {
            console.log(`❌ ${movement.createdAt.toISOString()} | Type: ${movement.movementType.padEnd(6)} | Qty: ${String(movement.quantity).padStart(4)} | Before: ${String(movement.previousStock).padStart(4)} → ${String(correctPreviousStock).padStart(4)} | After: ${String(movement.newStock).padStart(4)} → ${String(calculatedNewStock).padStart(4)}`);

            // Update to correct values
            movement.previousStock = correctPreviousStock;
            movement.newStock = calculatedNewStock;
            await movement.save();
            fixed++;
          } else {
            console.log(`✅ ${movement.createdAt.toISOString()} | Type: ${movement.movementType.padEnd(6)} | Qty: ${String(movement.quantity).padStart(4)} | Before: ${String(correctPreviousStock).padStart(4)} | After: ${String(calculatedNewStock).padStart(4)}`);
          }

          // Update running stock for next iteration
          runningStock = calculatedNewStock;
        } catch (err) {
          console.error(`Error fixing movement ${movement._id}:`, err.message);
          errors++;
        }
      }
    }

    console.log(`\n\n📈 Migration Summary:`);
    console.log(`   Total movements: ${movements.length}`);
    console.log(`   Fixed: ${fixed}`);
    console.log(`   Errors: ${errors}`);

    if (fixed > 0) {
      console.log(`\n✨ Successfully fixed ${fixed} stock movements!`);
    } else {
      console.log(`\n✓ All stock movements are correct!`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

fixStockMovements();

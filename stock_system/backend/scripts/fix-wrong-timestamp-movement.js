import mongoose from 'mongoose';
import StockMovement from '../models/StockMovement.js';

const MONGODB_URI = 'mongodb://mongo:KTlBvUhGjEidMDEKLAzevAVCOATaiNsU@gondola.proxy.rlwy.net:33948/test?authSource=admin';

async function fixWrongTimestampMovement() {
  try {
    await mongoose.connect(MONGODB_URI);

    // Find the movement that was created with wrong timestamp
    const wrongMovement = await StockMovement.findOne({
      sku: 'XSR-SW-SKP-B-M',
      reference: 'SO2569-0006',
      createdAt: { $gte: new Date('2026-01-06T13:00:00Z'), $lt: new Date('2026-01-06T14:00:00Z') }
    });

    if (!wrongMovement) {
      console.log('No wrong-timestamp movement found');
      await mongoose.disconnect();
      return;
    }

    console.log('Found wrong-timestamp movement:');
    console.log(`  SKU: ${wrongMovement.sku}`);
    console.log(`  Reference: ${wrongMovement.reference}`);
    console.log(`  Quantity: ${wrongMovement.quantity}`);
    console.log(`  Created: ${wrongMovement.createdAt}`);
    console.log(`  Previous Stock: ${wrongMovement.previousStock} → New Stock: ${wrongMovement.newStock}`);

    // Delete it
    await StockMovement.findByIdAndDelete(wrongMovement._id);
    console.log('\n✅ Deleted wrong-timestamp movement');

    // Now recalculate all movements for XSR-SW-SKP-B-M to fix previousStock/newStock
    console.log('\nRecalculating movements for XSR-SW-SKP-B-M...');
    
    const movements = await StockMovement.find({ sku: 'XSR-SW-SKP-B-M' }).sort({ createdAt: 1 });
    
    let runningStock = 0;
    let updated = 0;
    
    for (const mov of movements) {
      const oldPrev = mov.previousStock;
      const oldNew = mov.newStock;
      
      mov.previousStock = runningStock;
      mov.newStock = runningStock + mov.quantity;
      
      await mov.save();
      updated++;
      
      const changed = (oldPrev !== mov.previousStock || oldNew !== mov.newStock);
      if (changed) {
        console.log(`  ✅ ${mov.createdAt.toISOString()} | Qty: ${String(mov.quantity).padStart(4)} | ${oldPrev} → ${oldNew} => ${mov.previousStock} → ${mov.newStock}`);
      }
      
      runningStock = mov.newStock;
    }

    console.log(`\n✅ Updated ${updated} movements`);

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixWrongTimestampMovement();

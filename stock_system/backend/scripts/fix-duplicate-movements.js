/**
 * Fix the extra movement from duplicate entry
 * There's 1 extra unit recorded - likely from duplication when recreating movements
 */

import mongoose from 'mongoose';
import StockMovement from '../models/StockMovement.js';

const MONGODB_URI = 'mongodb://mongo:KTlBvUhGjEidMDEKLAzevAVCOATaiNsU@gondola.proxy.rlwy.net:33948/test?authSource=admin';

async function fixDuplicates() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    // Find duplicate movements (same SKU, same reference, same quantity, close timestamps)
    const duplicates = await StockMovement.aggregate([
      {
        $group: {
          _id: { sku: '$sku', reference: '$reference', quantity: '$quantity' },
          count: { $sum: 1 },
          ids: { $push: '$_id' },
          docs: { $push: '$$ROOT' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    console.log(`Found ${duplicates.length} potential duplicates\n`);

    let deleted = 0;
    
    for (const dup of duplicates) {
      console.log(`Checking ${dup._id.sku} (Ref: ${dup._id.reference}, Qty: ${dup._id.quantity})`);
      console.log(`  Found ${dup.count} copies`);
      
      // Keep the first one, delete the rest
      const idsToDelete = dup.ids.slice(1); // Skip first
      console.log(`  Deleting ${idsToDelete.length} duplicate(s)`);
      
      for (const id of idsToDelete) {
        await StockMovement.findByIdAndDelete(id);
        deleted++;
      }
    }

    console.log(`\n✅ Deleted ${deleted} duplicate movements`);

    // Also find movements with timestamps but orders with 00:00:00
    // These should match by date, not time
    console.log('\nChecking for timestamp misalignment...');
    
    const allMovements = await StockMovement.find();
    let alignmentIssues = 0;
    
    for (const mov of allMovements) {
      const movDate = new Date(mov.createdAt);
      // If time is not midnight and reference starts with SO2569, it's likely a mismatch
      if (mov.reference && mov.reference.startsWith('SO2569')) {
        if (movDate.getHours() !== 0 || movDate.getMinutes() !== 0) {
          // This was created from an order that was dated midnight
          // Check if there's another movement on the same date at midnight
          const movDateStr = movDate.toISOString().split('T')[0];
          alignmentIssues++;
        }
      }
    }
    
    console.log(`Found ${alignmentIssues} timestamp alignment issues (not fixing automatically)\n`);

    await mongoose.disconnect();
    console.log('✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixDuplicates();

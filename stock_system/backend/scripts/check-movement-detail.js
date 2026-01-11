import mongoose from 'mongoose';
import StockMovement from '../models/StockMovement.js';

const MONGODB_URI = 'mongodb://mongo:KTlBvUhGjEidMDEKLAzevAVCOATaiNsU@gondola.proxy.rlwy.net:33948/test?authSource=admin';

async function checkMovement() {
  try {
    await mongoose.connect(MONGODB_URI);

    // Find the suspicious movement
    const movement = await StockMovement.findOne({
      sku: 'XSR-SW-SKP-B-M',
      createdAt: { $gte: new Date('2026-01-06T13:00:00Z'), $lt: new Date('2026-01-06T14:00:00Z') }
    });

    console.log('Movement found:');
    console.log(JSON.stringify(movement, null, 2));

    // Count all XSR-SW-SKP-B-M movements
    const count = await StockMovement.countDocuments({ sku: 'XSR-SW-SKP-B-M' });
    console.log(`\nTotal XSR-SW-SKP-B-M movements: ${count}`);

    // List all XSR-SW-SKP-B-M movements
    const all = await StockMovement.find({ sku: 'XSR-SW-SKP-B-M' }).sort({ createdAt: 1 });
    console.log('\nAll movements:');
    all.forEach((m, i) => {
      console.log(`${i+1}. ${m.createdAt.toISOString()} | ${m.movementType.padEnd(5)} | Qty: ${String(m.quantity).padStart(4)} | Prev: ${String(m.previousStock).padStart(4)} | New: ${String(m.newStock).padStart(4)} | Ref: ${m.reference}`);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkMovement();

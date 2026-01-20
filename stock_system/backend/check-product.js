import mongoose from 'mongoose';
import Product from './models/Product.js';
import dotenv from 'dotenv';

// Load .env from root
dotenv.config({ path: '../../.env' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env');
  process.exit(1);
}

try {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const product = await Product.findOne(
    { 'variants.sku': 'XSR-SW-WT-N-S' }
  ).lean();

  if (product) {
    console.log('\n📦 Product Found:');
    console.log('Name:', product.name);
    console.log('Status:', product.status);
    console.log('enableStockAlerts:', product.enableStockAlerts);
    
    const variant = product.variants.find(v => v.sku === 'XSR-SW-WT-N-S');
    console.log('\n📌 Variant Details:');
    console.log('SKU:', variant.sku);
    console.log('Variant Status:', variant.status);
    console.log('Stock On Hand:', variant.stockOnHand);
    console.log('Reorder Point:', variant.reorderPoint);
    console.log('Incoming:', variant.incoming);
  } else {
    console.log('❌ Product not found');
  }

  await mongoose.disconnect();
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}

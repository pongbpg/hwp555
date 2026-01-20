import mongoose from 'mongoose';
import Product from './models/Product.js';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

try {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');
  
  // ค้นหาสินค้า XSR-SW-WT-N-S โดยไม่ใช้ .lean()
  const product = await Product.findOne({ 'variants.sku': 'XSR-SW-WT-N-S' });
  
  if (!product) {
    console.log('❌ Product not found');
    process.exit(0);
  }
  
  const variant = product.variants.find(v => v.sku === 'XSR-SW-WT-N-S');
  
  console.log('📦 Product:', product.name);
  console.log('   Status:', product.status);
  console.log('   enableStockAlerts:', product.enableStockAlerts);
  console.log('\n📌 Variant: XSR-SW-WT-N-S');
  console.log('   Status:', variant.status);
  console.log('   Batches count:', variant.batches?.length || 0);
  console.log('   stockOnHand (virtual):', variant.stockOnHand); // ✅ ไม่ใช้ .lean() จะได้ virtual field
  console.log('   Reorder Point:', variant.reorderPoint);
  console.log('   Incoming:', variant.incoming);
  
  if (variant.batches && variant.batches.length > 0) {
    console.log('\n📦 Batches:');
    variant.batches.forEach((b, idx) => {
      console.log(`   [${idx + 1}] ${b.batchRef || 'N/A'}`);
      console.log(`       Quantity: ${b.quantity}`);
      console.log(`       Cost: ${b.cost}`);
      console.log(`       Received: ${b.receivedAt?.toISOString().split('T')[0] || 'N/A'}`);
    });
  } else {
    console.log('\n⚠️  No batches found - this is why stockOnHand = 0');
  }
  
  // ทดสอบว่า toJSON มี virtuals ไหม
  console.log('\n🔍 Testing JSON serialization:');
  const json = variant.toJSON();
  console.log('   stockOnHand in JSON:', json.stockOnHand);
  console.log('   Has batches in JSON:', json.batches?.length);

  await mongoose.disconnect();
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}

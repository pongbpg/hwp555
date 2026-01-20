import mongoose from 'mongoose';
import Product from './models/Product.js';
import { checkVariantStockRisk } from './services/stockAlertService.js';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

try {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');
  
  // ค้นหาสินค้า XSR-SW-WT-N-S
  const product = await Product.findOne({ 'variants.sku': 'XSR-SW-WT-N-S' });
  
  if (!product) {
    console.log('❌ Product not found');
    process.exit(0);
  }
  
  const variant = product.variants.find(v => v.sku === 'XSR-SW-WT-N-S');
  
  console.log('📦 Product:', product.name);
  console.log('   enableStockAlerts:', product.enableStockAlerts);
  console.log('\n📌 Variant: XSR-SW-WT-N-S');
  console.log('   Status:', variant.status);
  console.log('   stockOnHand:', variant.stockOnHand);
  console.log('   incoming:', variant.incoming);
  console.log('   availableStock (stockOnHand + incoming):', (variant.stockOnHand || 0) + (variant.incoming || 0));
  console.log('   reorderPoint:', variant.reorderPoint);
  
  // ทดสอบ checkVariantStockRisk
  console.log('\n🔍 Testing checkVariantStockRisk...');
  const alert = await checkVariantStockRisk(product, variant);
  
  if (alert) {
    console.log('\n⚠️  Alert triggered:');
    console.log('   currentStock:', alert.currentStock);
    console.log('   incoming:', alert.incoming);
    console.log('   availableStock:', alert.availableStock);
    console.log('   suggestedReorderPoint:', alert.suggestedReorderPoint);
    console.log('   suggestedOrder:', alert.suggestedOrder);
    console.log('   stockStatus:', alert.stockStatus);
  } else {
    console.log('\n✅ No alert - Stock level is sufficient (including incoming)');
  }

  await mongoose.disconnect();
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}

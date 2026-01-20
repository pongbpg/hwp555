import mongoose from 'mongoose';
import Product from './models/Product.js';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

try {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');
  
  // ค้นหา SKU ที่มี XSR-SW
  const allProducts = await Product.find().lean();
  console.log(`📊 Total products: ${allProducts.length}\n`);
  
  // ค้นหาสินค้าที่มี SKU ขึ้นต้นด้วย XSR
  const xsrProducts = allProducts.filter(p => 
    p.variants && p.variants.some(v => v.sku && v.sku.startsWith('XSR'))
  );
  
  console.log(`🔍 Products with XSR SKU: ${xsrProducts.length}`);
  
  if (xsrProducts.length > 0) {
    xsrProducts.forEach(p => {
      console.log(`\n📦 ${p.name}`);
      console.log(`   Status: ${p.status}`);
      console.log(`   enableStockAlerts: ${p.enableStockAlerts}`);
      const xsrVariants = p.variants.filter(v => v.sku && v.sku.startsWith('XSR'));
      console.log(`   XSR Variants:`);
      xsrVariants.forEach(v => {
        console.log(`     - SKU: ${v.sku}`);
        console.log(`       Status: ${v.status}`);
        console.log(`       Stock: ${v.stockOnHand}`);
      });
    });
  } else {
    console.log('❌ No products found with XSR SKU\n');
    
    // แสดง sample SKU
    console.log('Sample SKUs in database:');
    allProducts.slice(0, 3).forEach(p => {
      if (p.variants && p.variants.length > 0) {
        console.log(`  ${p.name}: ${p.variants[0].sku}`);
      }
    });
  }

  await mongoose.disconnect();
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}

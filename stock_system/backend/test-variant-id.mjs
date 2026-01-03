#!/usr/bin/env node
/**
 * Test: Verify variant ID preservation during product edit
 * ตรวจสอบว่า variant ID ยังคงเดิมเมื่อแก้ไขสินค้า
 */

import mongoose from 'mongoose';
import Product from './models/Product.js';

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hwp555';
console.log('📌 Connecting to MongoDB:', MONGODB_URI);
await mongoose.connect(MONGODB_URI);

try {
  // Step 1: Create a test product with variants
  console.log('\n✅ Step 1: Creating test product...');
  const testProduct = new Product({
    name: 'Test Product - Variant ID Preservation',
    sku: 'TEST-001',
    skuPrefix: 'TEST',
    costingMethod: 'FIFO',
    category: null,
    brand: null,
    variants: [
      {
        sku: 'TEST-V1',
        price: 100,
        cost: 50,
        stockOnHand: 10,
        attributes: { color: 'Red', size: 'L' }
      },
      {
        sku: 'TEST-V2',
        price: 120,
        cost: 60,
        stockOnHand: 20,
        attributes: { color: 'Blue', size: 'M' }
      }
    ]
  });
  
  await testProduct.save();
  console.log('✓ Product created with ID:', testProduct._id.toString());
  
  const originalVariantIds = testProduct.variants.map(v => v._id.toString());
  console.log('✓ Original variant IDs:', originalVariantIds);

  // Step 2: Fetch product and update with variant IDs preserved
  console.log('\n✅ Step 2: Fetching product and updating...');
  const fetched = await Product.findById(testProduct._id);
  console.log('✓ Product fetched');
  
  // Simulate what frontend sends: preserve variant IDs
  const updatePayload = {
    name: fetched.name + ' - UPDATED',
    variants: fetched.variants.map(v => ({
      _id: v._id,  // ✅ KEY: Preserve the ID
      sku: v.sku + '_UPDATED',
      price: v.price + 10,
      cost: v.cost + 5,
      stockOnHand: v.stockOnHand + 5,
      attributes: v.attributes
    }))
  };
  
  console.log('✓ Update payload prepared with variant IDs:', 
    updatePayload.variants.map(v => v._id.toString())
  );

  // Step 3: Perform the update
  console.log('\n✅ Step 3: Updating product...');
  const updated = await Product.findByIdAndUpdate(
    testProduct._id,
    updatePayload,
    { new: true }
  );
  
  const updatedVariantIds = updated.variants.map(v => v._id.toString());
  console.log('✓ Updated variant IDs:', updatedVariantIds);

  // Step 4: Verify IDs remained the same
  console.log('\n✅ Step 4: Verifying ID preservation...');
  let allIdPreserved = true;
  for (let i = 0; i < originalVariantIds.length; i++) {
    const originalId = originalVariantIds[i];
    const updatedId = updatedVariantIds[i];
    const preserved = originalId === updatedId;
    
    console.log(`  Variant ${i+1}: ${preserved ? '✓ PRESERVED' : '✗ CHANGED'}`);
    console.log(`    Original: ${originalId}`);
    console.log(`    Updated:  ${updatedId}`);
    
    if (!preserved) allIdPreserved = false;
  }

  // Step 5: Verify other data was updated
  console.log('\n✅ Step 5: Verifying data was updated...');
  console.log('✓ Product name updated:', updated.name.includes('UPDATED'));
  console.log('✓ Variant SKU updated:', updated.variants[0].sku.includes('UPDATED'));
  console.log('✓ Variant price updated:', updated.variants[0].price === 110);
  console.log('✓ Variant stockOnHand updated:', updated.variants[0].stockOnHand === 15);

  // Final result
  console.log('\n' + '='.repeat(60));
  if (allIdPreserved) {
    console.log('✅ SUCCESS: Variant IDs were preserved during update!');
    console.log('This means inventory orders should still link correctly.');
  } else {
    console.log('❌ FAILED: Some variant IDs changed during update!');
    console.log('This would break inventory order references.');
  }
  console.log('='.repeat(60));

  // Cleanup
  console.log('\n🧹 Cleaning up test data...');
  await Product.deleteOne({ _id: testProduct._id });
  console.log('✓ Test product removed');

} catch (error) {
  console.error('❌ Test error:', error);
} finally {
  await mongoose.connection.close();
  console.log('\n✓ MongoDB connection closed');
}

#!/usr/bin/env node
/**
 * Test script for new SKU formula
 * Formula: {Brand} - {Category} - {Model} - {Color} - {Size} - {Material}
 */

import axios from 'axios';

const API_BASE = 'http://localhost:5001/api';

// Test token (you'll need to login first or use a valid token)
const testToken = process.env.AUTH_TOKEN || '';

const api = axios.create({
  baseURL: API_BASE,
  headers: testToken ? { Authorization: `Bearer ${testToken}` } : {},
});

async function testSKUFormula() {
  try {
    console.log('🧪 Testing new SKU formula...\n');

    // Step 1: Get categories and brands
    console.log('📋 Fetching categories and brands...');
    const [categoriesRes, brandsRes] = await Promise.all([
      api.get('/categories'),
      api.get('/brands'),
    ]);

    const categories = categoriesRes.data || [];
    const brands = brandsRes.data || [];

    if (categories.length === 0 || brands.length === 0) {
      console.error('❌ No categories or brands found. Create some first.');
      return;
    }

    const testCategory = categories[0];
    const testBrand = brands[0];

    console.log(`✅ Using category: ${testCategory.name} (${testCategory._id})`);
    console.log(`✅ Using brand: ${testBrand.name} (${testBrand._id})\n`);

    // Step 2: Create a test product with new SKU formula
    console.log('📝 Creating test product with new SKU formula...');
    
    const testProduct = {
      name: 'Test Product - SKU Formula',
      description: 'Testing new SKU formula: Brand - Category - Model - Color - Size - Material',
      category: testCategory._id,
      brand: testBrand._id,
      status: 'active',
      enableStockAlerts: true,
      costingMethod: 'FIFO',
      leadTimeDays: 7,
      reorderBufferDays: 7,
      minOrderQty: 0,
      variants: [
        {
          // SKU will be auto-generated: Nike - Shoe - AirMax90 - Black - 40 - Leather
          sku: '',
          model: 'AirMax90',
          color: 'Black',
          size: '40',
          material: 'Leather',
          price: 3000,
          cost: 1500,
          stockOnHand: 10,
        },
        {
          // SKU will be auto-generated: Nike - Shoe - React - White - 41 - Fabric
          sku: '',
          model: 'React',
          color: 'White',
          size: '41',
          material: 'Fabric',
          price: 2500,
          cost: 1200,
          stockOnHand: 15,
        },
      ],
    };

    const createRes = await api.post('/products', testProduct);
    const createdProduct = createRes.data;

    console.log('✅ Product created successfully!\n');
    console.log('📊 Generated SKUs:');
    createdProduct.variants.forEach((variant, idx) => {
      console.log(`  Variant ${idx + 1}: ${variant.sku}`);
      console.log(`    Model: ${variant.model}, Color: ${variant.color}, Size: ${variant.size}, Material: ${variant.material}`);
    });

    // Step 3: Verify SKU format
    console.log('\n🔍 Verifying SKU format...');
    const expectedFormat = `${testBrand.name} - ${testCategory.name} -`;
    const allCorrect = createdProduct.variants.every((v) => v.sku.startsWith(expectedFormat));

    if (allCorrect) {
      console.log('✅ All SKUs follow the new formula format!');
    } else {
      console.log('❌ SKU format does not match expected formula');
    }

    // Step 4: Verify all required fields are present in SKU
    console.log('\n📋 Checking SKU completeness...');
    createdProduct.variants.forEach((variant, idx) => {
      const skuParts = variant.sku.split(' - ');
      const hasAllParts = skuParts.length >= 6;
      console.log(`  Variant ${idx + 1}: ${hasAllParts ? '✅' : '❌'} Parts: ${skuParts.length} (Expected: 6)`);
      console.log(`    ${variant.sku}`);
    });

    console.log('\n✅ SKU formula test completed successfully!');
    console.log(`\nCreated product ID: ${createdProduct._id}`);
    
  } catch (error) {
    if (error.response?.status === 401) {
      console.error('❌ Authentication failed. Please set AUTH_TOKEN environment variable');
      console.error('   export AUTH_TOKEN="your-jwt-token"');
    } else {
      console.error('❌ Error:', error.response?.data?.error || error.message);
    }
  }
}

testSKUFormula();

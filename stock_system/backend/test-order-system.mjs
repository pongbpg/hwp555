#!/usr/bin/env node

/**
 * Order System Test Script
 * ทดสอบการทำงานของ Order ทุกประเภท และการคำนวณต้นทุน/สต็อก
 * 
 * Usage:
 * 1. ตั้งค่า environment variables:
 *    export AUTH_TOKEN="your-jwt-token"
 *    export API_URL="http://localhost:5001/api" (optional)
 * 
 * 2. รัน script:
 *    node test-order-system.mjs
 * 
 * 3. ดูผลการทดสอบแต่ละขั้นตอน
 */

import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ==================== Configuration ====================
const API_URL = process.env.API_URL || 'http://localhost:5001/api';
const AUTH_TOKEN = process.env.AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error('❌ Error: AUTH_TOKEN environment variable is required');
  console.error('   Example: export AUTH_TOKEN="your-jwt-token"');
  process.exit(1);
}

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

// ==================== Test Results ====================
const testResults = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: [],
};

// ==================== Helper Functions ====================
function log(emoji, message, data = null) {
  console.log(`${emoji} ${message}`);
  if (data) {
    console.log('   ', JSON.stringify(data, null, 2).split('\n').join('\n    '));
  }
}

function success(message, data = null) {
  testResults.passed++;
  testResults.tests.push({ status: 'PASS', message });
  log('✅', message, data);
}

function fail(message, error = null) {
  testResults.failed++;
  testResults.tests.push({ status: 'FAIL', message, error: error?.message });
  log('❌', message);
  if (error) {
    console.error('   Error:', error.message);
    if (error.response?.data) {
      console.error('   Response:', error.response.data);
    }
  }
}

function warn(message, data = null) {
  testResults.warnings++;
  testResults.tests.push({ status: 'WARN', message });
  log('⚠️', message, data);
}

function info(message, data = null) {
  log('ℹ️', message, data);
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    success(`${message}: ${actual} === ${expected}`);
  } else {
    fail(`${message}: Expected ${expected}, got ${actual}`);
  }
}

function assertClose(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    success(`${message}: ${actual} ≈ ${expected} (diff: ${diff.toFixed(2)})`);
  } else {
    fail(`${message}: ${actual} not close to ${expected} (diff: ${diff.toFixed(2)})`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== Test Setup ====================
let testProduct = null;
let testVariant = null;
let testCategory = null;
let testBrand = null;
let createdOrders = [];

async function setupTestData() {
  console.log('\n' + '='.repeat(60));
  console.log('🔧 Setting up test data...');
  console.log('='.repeat(60));

  try {
    // Create test category
    const categoryRes = await api.post('/categories', {
      name: `TEST-CATEGORY-${Date.now()}`,
      description: 'Test category for order testing',
    });
    testCategory = categoryRes.data;
    success('Created test category', { id: testCategory._id, name: testCategory.name });

    // Create test brand
    const brandRes = await api.post('/brands', {
      name: `TEST-BRAND-${Date.now()}`,
      description: 'Test brand for order testing',
    });
    testBrand = brandRes.data;
    success('Created test brand', { id: testBrand._id, name: testBrand.name });

    // Create test product with FIFO costing and initial variant
    const testSKU = `TEST-SKU-${Date.now()}`;
    const productRes = await api.post('/products', {
      name: `TEST-PRODUCT-${Date.now()}`,
      category: testCategory._id,
      brand: testBrand._id,
      unit: 'pcs',
      costingMethod: 'FIFO',
      leadTimeDays: 7,
      reorderBufferDays: 7,
      minOrderQty: 10,
      enableStockAlerts: true,
      status: 'active',
      variants: [
        {
          name: 'Test Variant',
          sku: testSKU,
          price: 100,
          cost: 50,
          reorderPoint: 20,
          allowBackorder: false,
          status: 'active',
        }
      ]
    });
    testProduct = productRes.data;
    testVariant = testProduct.variants[0];
    success('Created test product with variant', { 
      productId: testProduct._id, 
      productName: testProduct.name, 
      costingMethod: testProduct.costingMethod,
      variantId: testVariant._id,
      sku: testVariant.sku,
      initialStock: testVariant.stockOnHand || 0
    });

  } catch (error) {
    console.error('Setup Error Details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      stack: error.stack,
    });
    fail('Failed to setup test data', error);
    throw error;
  }
}

async function cleanupTestData() {
  console.log('\n' + '='.repeat(60));
  console.log('🧹 Cleaning up test data...');
  console.log('='.repeat(60));

  try {
    // Cancel all created orders first
    for (const order of createdOrders) {
      try {
        await api.patch(`/inventory/orders/${order._id}/cancel`, {
          reason: 'Test cleanup'
        });
        info(`Cancelled order: ${order.reference}`);
      } catch (error) {
        warn(`Failed to cancel order ${order.reference}: ${error.message}`);
      }
    }

    // Delete test product (will cascade delete variants)
    if (testProduct) {
      await api.delete(`/products/${testProduct._id}`);
      success('Deleted test product');
    }

    // Delete test category
    if (testCategory) {
      await api.delete(`/categories/${testCategory._id}`);
      success('Deleted test category');
    }

    // Delete test brand
    if (testBrand) {
      await api.delete(`/brands/${testBrand._id}`);
      success('Deleted test brand');
    }

  } catch (error) {
    warn('Cleanup had some errors', error);
  }
}

// ==================== Helper: Get Current Stock ====================
async function getCurrentStock() {
  const res = await api.get(`/products/${testProduct._id}`);
  const product = res.data;
  const variant = product.variants.find(v => String(v._id) === String(testVariant._id));
  return {
    stockOnHand: variant.stockOnHand || 0,
    incoming: variant.incoming || 0,
    committed: variant.committed || 0,
    available: variant.available || 0,
    batches: variant.batches || [],
    batchCount: (variant.batches || []).length,
    totalBatchQty: (variant.batches || []).reduce((sum, b) => sum + (b.quantity || 0), 0),
  };
}

// ==================== Helper: Create Order ====================
async function createOrder(type, items, additionalData = {}) {
  const now = new Date();
  const thaiYear = now.getFullYear() + 543;
  const prefixes = {
    sale: 'SO',
    purchase: 'PO',
    adjustment: 'ADJ',
    damage: 'DMG',
    expired: 'EXP',
    return: 'RTN',
  };
  
  const reference = `${prefixes[type]}${thaiYear}-TEST-${Date.now()}`;
  
  const orderData = {
    type,
    items,
    reference,
    orderDate: now.toISOString().split('T')[0],
    notes: `Test order for ${type}`,
    ...additionalData,
  };

  const res = await api.post('/inventory/orders', orderData);
  const order = res.data;
  createdOrders.push(order);
  return order;
}

// ==================== Test Cases ====================

// Test 1: Purchase Order (เพิ่ม incoming, รอรับของ)
async function testPurchaseOrder() {
  console.log('\n' + '='.repeat(60));
  console.log('📦 Test 1: Purchase Order (Pending → Receive → Complete)');
  console.log('='.repeat(60));

  try {
    const stockBefore = await getCurrentStock();
    info('Stock before purchase', stockBefore);

    // Create purchase order
    const order = await createOrder('purchase', [
      {
        productId: testProduct._id,
        variantId: testVariant._id,
        quantity: 100,
        unitPrice: 40, // Cost per unit
        batchRef: `BATCH-PO-${Date.now()}`,
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      }
    ]);
    success('Created purchase order', { 
      reference: order.reference, 
      status: order.status 
    });

    // Check incoming increased
    const stockAfterOrder = await getCurrentStock();
    assertEqual(stockAfterOrder.incoming, stockBefore.incoming + 100, 'Incoming should increase');
    assertEqual(stockAfterOrder.stockOnHand, stockBefore.stockOnHand, 'Stock should not change yet');

    // Receive the order
    const receiveRes = await api.patch(`/inventory/orders/${order._id}/receive`, {
      items: [
        {
          variantId: testVariant._id,
          receivedQuantity: 100,
        }
      ]
    });
    success('Received purchase order', { status: receiveRes.data.status });

    // Check stock increased and incoming decreased
    const stockAfterReceive = await getCurrentStock();
    assertEqual(stockAfterReceive.stockOnHand, stockBefore.stockOnHand + 100, 'Stock should increase by 100');
    assertEqual(stockAfterReceive.incoming, stockBefore.incoming, 'Incoming should be back to original');
    assertEqual(stockAfterReceive.batchCount, stockBefore.batchCount + 1, 'Should have one more batch');
    assertClose(stockAfterReceive.totalBatchQty, stockAfterReceive.stockOnHand, 0.01, 'Total batch qty should match stockOnHand');

  } catch (error) {
    fail('Purchase order test failed', error);
  }
}

// Test 2: Sale Order (ลดสต็อก, consume batches)
async function testSaleOrder() {
  console.log('\n' + '='.repeat(60));
  console.log('💰 Test 2: Sale Order (Consume Batches)');
  console.log('='.repeat(60));

  try {
    const stockBefore = await getCurrentStock();
    info('Stock before sale', stockBefore);

    if (stockBefore.stockOnHand < 30) {
      warn('Not enough stock for sale test, skipping');
      return;
    }

    // Create sale order
    const order = await createOrder('sale', [
      {
        productId: testProduct._id,
        variantId: testVariant._id,
        quantity: 30,
        unitPrice: 100, // Selling price
      }
    ]);
    success('Created sale order', { 
      reference: order.reference,
      quantity: 30,
      unitPrice: order.items[0].unitPrice,
      unitCost: order.items[0].unitCost, // Should be from batch
    });

    // Check stock decreased
    const stockAfter = await getCurrentStock();
    assertEqual(stockAfter.stockOnHand, stockBefore.stockOnHand - 30, 'Stock should decrease by 30');
    assertClose(stockAfter.totalBatchQty, stockAfter.stockOnHand, 0.01, 'Total batch qty should match stockOnHand');

    // Check costing method applied (FIFO)
    info('Sale item cost details', {
      unitCost: order.items[0].unitCost,
      totalCost: order.items[0].unitCost * order.items[0].quantity,
      unitPrice: order.items[0].unitPrice,
      totalRevenue: order.items[0].unitPrice * order.items[0].quantity,
      profit: (order.items[0].unitPrice - order.items[0].unitCost) * order.items[0].quantity,
    });

  } catch (error) {
    fail('Sale order test failed', error);
  }
}

// Test 3: Adjustment Order (ปรับสต็อก - เพิ่ม)
async function testAdjustmentOrderIncrease() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test 3: Adjustment Order (Increase Stock)');
  console.log('='.repeat(60));

  try {
    const stockBefore = await getCurrentStock();
    info('Stock before adjustment', stockBefore);

    const targetStock = stockBefore.stockOnHand + 50;
    
    // Create adjustment order (increase)
    const order = await createOrder('adjustment', [
      {
        productId: testProduct._id,
        variantId: testVariant._id,
        quantity: targetStock, // Target stock
        unitPrice: 45, // Cost per unit for new stock
      }
    ]);
    success('Created adjustment order (increase)', { 
      reference: order.reference,
      currentStock: stockBefore.stockOnHand,
      targetStock,
      actualDelta: order.items[0].actualDelta,
    });

    // Check actualDelta is recorded
    if (order.items[0].actualDelta !== undefined) {
      assertEqual(order.items[0].actualDelta, 50, 'actualDelta should be +50');
    } else {
      warn('actualDelta not recorded in order item');
    }

    // Check stock increased
    const stockAfter = await getCurrentStock();
    assertEqual(stockAfter.stockOnHand, targetStock, 'Stock should match target');
    assertClose(stockAfter.totalBatchQty, stockAfter.stockOnHand, 0.01, 'Total batch qty should match stockOnHand');

  } catch (error) {
    fail('Adjustment order (increase) test failed', error);
  }
}

// Test 4: Adjustment Order (ปรับสต็อก - ลด)
async function testAdjustmentOrderDecrease() {
  console.log('\n' + '='.repeat(60));
  console.log('📉 Test 4: Adjustment Order (Decrease Stock)');
  console.log('='.repeat(60));

  try {
    const stockBefore = await getCurrentStock();
    info('Stock before adjustment', stockBefore);

    if (stockBefore.stockOnHand < 20) {
      warn('Not enough stock for decrease test, skipping');
      return;
    }

    const targetStock = stockBefore.stockOnHand - 20;
    
    // Create adjustment order (decrease)
    const order = await createOrder('adjustment', [
      {
        productId: testProduct._id,
        variantId: testVariant._id,
        quantity: targetStock, // Target stock
        unitPrice: 0, // Not used for decrease
      }
    ]);
    success('Created adjustment order (decrease)', { 
      reference: order.reference,
      currentStock: stockBefore.stockOnHand,
      targetStock,
      actualDelta: order.items[0].actualDelta,
    });

    // Check actualDelta is recorded
    if (order.items[0].actualDelta !== undefined) {
      assertEqual(order.items[0].actualDelta, -20, 'actualDelta should be -20');
    } else {
      warn('actualDelta not recorded in order item');
    }

    // Check stock decreased
    const stockAfter = await getCurrentStock();
    assertEqual(stockAfter.stockOnHand, targetStock, 'Stock should match target');
    assertClose(stockAfter.totalBatchQty, stockAfter.stockOnHand, 0.01, 'Total batch qty should match stockOnHand');

  } catch (error) {
    fail('Adjustment order (decrease) test failed', error);
  }
}

// Test 5: Damage Order (สินค้าเสียหาย)
async function testDamageOrder() {
  console.log('\n' + '='.repeat(60));
  console.log('💔 Test 5: Damage Order (Reduce Stock)');
  console.log('='.repeat(60));

  try {
    const stockBefore = await getCurrentStock();
    info('Stock before damage', stockBefore);

    if (stockBefore.stockOnHand < 10) {
      warn('Not enough stock for damage test, skipping');
      return;
    }

    // Create damage order
    const order = await createOrder('damage', [
      {
        productId: testProduct._id,
        variantId: testVariant._id,
        quantity: 10,
        supplier: 'Water damage during storage',
        notes: 'Test damage order',
      }
    ]);
    success('Created damage order', { 
      reference: order.reference,
      quantity: 10,
    });

    // Check stock decreased
    const stockAfter = await getCurrentStock();
    assertEqual(stockAfter.stockOnHand, stockBefore.stockOnHand - 10, 'Stock should decrease by 10');
    assertClose(stockAfter.totalBatchQty, stockAfter.stockOnHand, 0.01, 'Total batch qty should match stockOnHand');

  } catch (error) {
    fail('Damage order test failed', error);
  }
}

// Test 6: Expired Order (สินค้าหมดอายุ)
async function testExpiredOrder() {
  console.log('\n' + '='.repeat(60));
  console.log('⏰ Test 6: Expired Order (Reduce Stock)');
  console.log('='.repeat(60));

  try {
    const stockBefore = await getCurrentStock();
    info('Stock before expired', stockBefore);

    if (stockBefore.stockOnHand < 5) {
      warn('Not enough stock for expired test, skipping');
      return;
    }

    // Create expired order
    const order = await createOrder('expired', [
      {
        productId: testProduct._id,
        variantId: testVariant._id,
        quantity: 5,
        supplier: 'Batch LOT-2024-001',
        notes: 'Test expired order',
      }
    ]);
    success('Created expired order', { 
      reference: order.reference,
      quantity: 5,
    });

    // Check stock decreased
    const stockAfter = await getCurrentStock();
    assertEqual(stockAfter.stockOnHand, stockBefore.stockOnHand - 5, 'Stock should decrease by 5');
    assertClose(stockAfter.totalBatchQty, stockAfter.stockOnHand, 0.01, 'Total batch qty should match stockOnHand');

  } catch (error) {
    fail('Expired order test failed', error);
  }
}

// Test 7: Return Order (รับคืนจากลูกค้า)
async function testReturnOrder() {
  console.log('\n' + '='.repeat(60));
  console.log('↩️  Test 7: Return Order (Increase Stock)');
  console.log('='.repeat(60));

  try {
    const stockBefore = await getCurrentStock();
    info('Stock before return', stockBefore);

    // Create return order
    const order = await createOrder('return', [
      {
        productId: testProduct._id,
        variantId: testVariant._id,
        quantity: 8,
        unitPrice: 40, // Cost to restore
        supplier: 'Customer return',
        notes: 'Test return order',
      }
    ]);
    success('Created return order', { 
      reference: order.reference,
      quantity: 8,
    });

    // Check stock increased
    const stockAfter = await getCurrentStock();
    assertEqual(stockAfter.stockOnHand, stockBefore.stockOnHand + 8, 'Stock should increase by 8');
    assertClose(stockAfter.totalBatchQty, stockAfter.stockOnHand, 0.01, 'Total batch qty should match stockOnHand');

  } catch (error) {
    fail('Return order test failed', error);
  }
}

// Test 8: Cancel Purchase Order
async function testCancelPurchaseOrder() {
  console.log('\n' + '='.repeat(60));
  console.log('❌ Test 8: Cancel Purchase Order');
  console.log('='.repeat(60));

  try {
    const stockBefore = await getCurrentStock();
    info('Stock before cancel test', stockBefore);

    // Create and receive purchase order
    const order = await createOrder('purchase', [
      {
        productId: testProduct._id,
        variantId: testVariant._id,
        quantity: 50,
        unitPrice: 35,
        batchRef: `BATCH-CANCEL-TEST-${Date.now()}`,
      }
    ]);
    success('Created purchase order for cancel test');

    await api.patch(`/inventory/orders/${order._id}/receive`, {
      items: [{ variantId: testVariant._id, receivedQuantity: 50 }]
    });
    success('Received purchase order');

    const stockAfterReceive = await getCurrentStock();
    assertEqual(stockAfterReceive.stockOnHand, stockBefore.stockOnHand + 50, 'Stock should increase by 50');

    // Cancel the order
    await api.patch(`/inventory/orders/${order._id}/cancel`, {
      reason: 'Test cancellation'
    });
    success('Cancelled purchase order');

    // Check stock rolled back
    const stockAfterCancel = await getCurrentStock();
    assertEqual(stockAfterCancel.stockOnHand, stockBefore.stockOnHand, 'Stock should be rolled back to original');
    assertClose(stockAfterCancel.totalBatchQty, stockAfterCancel.stockOnHand, 0.01, 'Total batch qty should match stockOnHand');

  } catch (error) {
    fail('Cancel purchase order test failed', error);
  }
}

// Test 9: Cancel Sale Order
async function testCancelSaleOrder() {
  console.log('\n' + '='.repeat(60));
  console.log('❌ Test 9: Cancel Sale Order');
  console.log('='.repeat(60));

  try {
    const stockBefore = await getCurrentStock();
    info('Stock before cancel test', stockBefore);

    if (stockBefore.stockOnHand < 15) {
      warn('Not enough stock for cancel sale test, skipping');
      return;
    }

    // Create sale order
    const order = await createOrder('sale', [
      {
        productId: testProduct._id,
        variantId: testVariant._id,
        quantity: 15,
        unitPrice: 100,
      }
    ]);
    success('Created sale order for cancel test');

    const stockAfterSale = await getCurrentStock();
    assertEqual(stockAfterSale.stockOnHand, stockBefore.stockOnHand - 15, 'Stock should decrease by 15');

    // Cancel the order
    await api.patch(`/inventory/orders/${order._id}/cancel`, {
      reason: 'Test cancellation'
    });
    success('Cancelled sale order');

    // Check stock rolled back (should create return batch)
    const stockAfterCancel = await getCurrentStock();
    assertEqual(stockAfterCancel.stockOnHand, stockBefore.stockOnHand, 'Stock should be rolled back to original');
    assertClose(stockAfterCancel.totalBatchQty, stockAfterCancel.stockOnHand, 0.01, 'Total batch qty should match stockOnHand');

  } catch (error) {
    fail('Cancel sale order test failed', error);
  }
}

// Test 10: Cancel Damage Order
async function testCancelDamageOrder() {
  console.log('\n' + '='.repeat(60));
  console.log('❌ Test 10: Cancel Damage Order');
  console.log('='.repeat(60));

  try {
    const stockBefore = await getCurrentStock();
    info('Stock before cancel test', stockBefore);

    if (stockBefore.stockOnHand < 12) {
      warn('Not enough stock for cancel damage test, skipping');
      return;
    }

    // Create damage order
    const order = await createOrder('damage', [
      {
        productId: testProduct._id,
        variantId: testVariant._id,
        quantity: 12,
        supplier: 'Test damage',
      }
    ]);
    success('Created damage order for cancel test');

    const stockAfterDamage = await getCurrentStock();
    assertEqual(stockAfterDamage.stockOnHand, stockBefore.stockOnHand - 12, 'Stock should decrease by 12');

    // Cancel the order
    await api.patch(`/inventory/orders/${order._id}/cancel`, {
      reason: 'Test cancellation'
    });
    success('Cancelled damage order');

    // Check stock rolled back (should create return batch)
    const stockAfterCancel = await getCurrentStock();
    assertEqual(stockAfterCancel.stockOnHand, stockBefore.stockOnHand, 'Stock should be rolled back to original');
    assertClose(stockAfterCancel.totalBatchQty, stockAfterCancel.stockOnHand, 0.01, 'Total batch qty should match stockOnHand');

  } catch (error) {
    fail('Cancel damage order test failed', error);
  }
}

// Test 11: Cancel Adjustment Order (Increase)
async function testCancelAdjustmentOrderIncrease() {
  console.log('\n' + '='.repeat(60));
  console.log('❌ Test 11: Cancel Adjustment Order (Increase)');
  console.log('='.repeat(60));

  try {
    const stockBefore = await getCurrentStock();
    info('Stock before cancel test', stockBefore);

    const targetStock = stockBefore.stockOnHand + 25;

    // Create adjustment order (increase)
    const order = await createOrder('adjustment', [
      {
        productId: testProduct._id,
        variantId: testVariant._id,
        quantity: targetStock,
        unitPrice: 45,
      }
    ]);
    success('Created adjustment order (increase) for cancel test');

    const stockAfterAdjust = await getCurrentStock();
    assertEqual(stockAfterAdjust.stockOnHand, targetStock, 'Stock should match target');

    // Cancel the order
    await api.patch(`/inventory/orders/${order._id}/cancel`, {
      reason: 'Test cancellation'
    });
    success('Cancelled adjustment order (increase)');

    // Check stock rolled back
    const stockAfterCancel = await getCurrentStock();
    assertEqual(stockAfterCancel.stockOnHand, stockBefore.stockOnHand, 'Stock should be rolled back to original');
    assertClose(stockAfterCancel.totalBatchQty, stockAfterCancel.stockOnHand, 0.01, 'Total batch qty should match stockOnHand');

  } catch (error) {
    fail('Cancel adjustment order (increase) test failed', error);
  }
}

// Test 12: Cancel Adjustment Order (Decrease)
async function testCancelAdjustmentOrderDecrease() {
  console.log('\n' + '='.repeat(60));
  console.log('❌ Test 12: Cancel Adjustment Order (Decrease)');
  console.log('='.repeat(60));

  try {
    const stockBefore = await getCurrentStock();
    info('Stock before cancel test', stockBefore);

    if (stockBefore.stockOnHand < 18) {
      warn('Not enough stock for cancel adjustment decrease test, skipping');
      return;
    }

    const targetStock = stockBefore.stockOnHand - 18;

    // Create adjustment order (decrease)
    const order = await createOrder('adjustment', [
      {
        productId: testProduct._id,
        variantId: testVariant._id,
        quantity: targetStock,
        unitPrice: 0,
      }
    ]);
    success('Created adjustment order (decrease) for cancel test', {
      actualDelta: order.items[0].actualDelta
    });

    const stockAfterAdjust = await getCurrentStock();
    assertEqual(stockAfterAdjust.stockOnHand, targetStock, 'Stock should match target');

    // Cancel the order
    await api.patch(`/inventory/orders/${order._id}/cancel`, {
      reason: 'Test cancellation'
    });
    success('Cancelled adjustment order (decrease)');

    // Check stock rolled back
    const stockAfterCancel = await getCurrentStock();
    assertEqual(stockAfterCancel.stockOnHand, stockBefore.stockOnHand, 'Stock should be rolled back to original');
    assertClose(stockAfterCancel.totalBatchQty, stockAfterCancel.stockOnHand, 0.01, 'Total batch qty should match stockOnHand');

  } catch (error) {
    fail('Cancel adjustment order (decrease) test failed', error);
  }
}

// ==================== Main Test Runner ====================
async function runTests() {
  console.log('\n' + '━'.repeat(60));
  console.log('🧪 ORDER SYSTEM TEST SUITE');
  console.log('━'.repeat(60));
  console.log(`📍 API URL: ${API_URL}`);
  console.log(`🔑 Auth Token: ${AUTH_TOKEN.substring(0, 20)}...`);
  console.log('━'.repeat(60));

  try {
    // Setup
    await setupTestData();

    // Run all tests
    await testPurchaseOrder();
    await testSaleOrder();
    await testAdjustmentOrderIncrease();
    await testAdjustmentOrderDecrease();
    await testDamageOrder();
    await testExpiredOrder();
    await testReturnOrder();
    await testCancelPurchaseOrder();
    await testCancelSaleOrder();
    await testCancelDamageOrder();
    await testCancelAdjustmentOrderIncrease();
    await testCancelAdjustmentOrderDecrease();

    // Final stock check
    console.log('\n' + '='.repeat(60));
    console.log('📊 Final Stock Status');
    console.log('='.repeat(60));
    const finalStock = await getCurrentStock();
    info('Final stock details', finalStock);

    // Cleanup
    await cleanupTestData();

  } catch (error) {
    console.error('\n💥 Test suite failed with critical error:', error.message);
    process.exit(1);
  }

  // Print summary
  console.log('\n' + '━'.repeat(60));
  console.log('📋 TEST SUMMARY');
  console.log('━'.repeat(60));
  console.log(`✅ Passed:   ${testResults.passed}`);
  console.log(`❌ Failed:   ${testResults.failed}`);
  console.log(`⚠️  Warnings: ${testResults.warnings}`);
  console.log(`📊 Total:    ${testResults.passed + testResults.failed}`);
  console.log('━'.repeat(60));

  if (testResults.failed > 0) {
    console.log('\n❌ Some tests failed. Please review the errors above.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed! Order system is working correctly.');
    process.exit(0);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});

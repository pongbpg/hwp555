#!/usr/bin/env node

/**
 * ทดสอบการจัดการสต็อกผ่าน Movement API
 * ตรวจสอบว่า batches และ virtual field stockOnHand ทำงานสอดคล้องกัน
 */

import axios from 'axios';

const BASE_URL = process.env.STOCK_API_URL || 'http://localhost:5001/api';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = (message, color = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

// ฟังก์ชันหา Product/Variant จาก SKU
async function findVariantBySKU(sku) {
  log(`\n🔍 ค้นหาสินค้า SKU: ${sku}`, 'cyan');
  
  const response = await api.get('/products', {
    params: { q: sku, limit: 10 },
  });
  
  const products = response.data.items || [];
  for (const product of products) {
    const variant = (product.variants || []).find(v => v.sku === sku);
    if (variant) {
      return { product, variant };
    }
  }
  
  return null;
}

// ฟังก์ชันดูรายละเอียด batches
async function inspectBatches(productId, variantId, sku) {
  log(`\n📦 ตรวจสอบ Batches ของ SKU: ${sku}`, 'cyan');
  
  const response = await api.get(`/products/${productId}`);
  const product = response.data;
  const variant = product.variants.find(v => String(v._id) === String(variantId));
  
  if (!variant) {
    log('❌ ไม่พบ variant', 'red');
    return null;
  }
  
  const batches = variant.batches || [];
  const totalFromBatches = batches.reduce((sum, b) => sum + (b.quantity || 0), 0);
  const virtualStockOnHand = variant.stockOnHand;
  
  log(`\n📊 สรุป:`, 'yellow');
  log(`  - Virtual stockOnHand: ${virtualStockOnHand}`, 'blue');
  log(`  - รวมจาก batches: ${totalFromBatches}`, 'blue');
  log(`  - จำนวน batches: ${batches.length}`, 'blue');
  log(`  - ตรงกัน: ${virtualStockOnHand === totalFromBatches ? '✅' : '❌'}`, 
      virtualStockOnHand === totalFromBatches ? 'green' : 'red');
  
  if (batches.length > 0) {
    log(`\n📋 รายละเอียด Batches:`, 'yellow');
    batches.forEach((batch, idx) => {
      log(`  ${idx + 1}. ${batch.batchRef || 'N/A'}: ${batch.quantity} ชิ้น (cost: ${batch.cost || 0}, received: ${new Date(batch.receivedAt).toLocaleString('th-TH')})`, 'blue');
    });
  }
  
  return { variant, totalFromBatches, virtualStockOnHand };
}

// ฟังก์ชันปรับ stock ผ่าน Movement
async function adjustStock(productId, variantId, sku, adjustQty, movementType = 'adjust', reason = 'ทดสอบ') {
  log(`\n🔧 ปรับสต็อก SKU: ${sku}`, 'cyan');
  log(`  - ปริมาณ: ${adjustQty > 0 ? '+' : ''}${adjustQty}`, 'blue');
  log(`  - ประเภท: ${movementType}`, 'blue');
  
  const payload = {
    productId,
    variantId,
    sku,
    movementType,
    quantity: adjustQty,
    reason,
    notes: 'สร้างจาก test script',
  };
  
  try {
    const response = await api.post('/movements', payload);
    const movement = response.data;
    
    log(`\n✅ ปรับสต็อกสำเร็จ:`, 'green');
    log(`  - Movement ID: ${movement._id}`, 'blue');
    log(`  - Previous Stock: ${movement.previousStock}`, 'blue');
    log(`  - New Stock: ${movement.newStock}`, 'blue');
    log(`  - Quantity Adjusted: ${movement.quantity}`, 'blue');
    
    return movement;
  } catch (error) {
    log(`\n❌ ปรับสต็อกล้มเหลว:`, 'red');
    log(`  - ${error.response?.data?.error || error.message}`, 'red');
    throw error;
  }
}

// ฟังก์ชันตรวจสอบ Movement History
async function checkMovementHistory(sku, limit = 5) {
  log(`\n📜 ประวัติการเคลื่อนไหว SKU: ${sku}`, 'cyan');
  
  const response = await api.get('/movements', {
    params: { sku, limit },
  });
  
  const movements = response.data.movements || [];
  
  if (movements.length === 0) {
    log('  ไม่มีประวัติ', 'yellow');
    return;
  }
  
  log(`\n📋 ${movements.length} รายการล่าสุด:`, 'yellow');
  movements.forEach((mov, idx) => {
    const date = new Date(mov.createdAt).toLocaleString('th-TH');
    log(`  ${idx + 1}. [${mov.movementType}] ${mov.quantity > 0 ? '+' : ''}${mov.quantity} | ${mov.previousStock} → ${mov.newStock} | ${date} | ${mov.createdByName || 'N/A'}`, 'blue');
  });
}

// ฟังก์ชันตรวจสอบใน Dashboard/Insights
async function checkDashboard(sku) {
  log(`\n📊 ตรวจสอบ Dashboard/Insights`, 'cyan');
  
  try {
    // ดึงข้อมูล Insights
    const insightsResponse = await api.get('/inventory/insights', {
      params: { days: 30 },
    });
    
    const insights = insightsResponse.data;
    
    // หา variant นี้ใน fastMovers หรือ lowStock
    const allItems = [
      ...(insights.fastMovers || []),
      ...(insights.lowStock || []),
      ...(insights.deadStock || []),
    ];
    
    const found = allItems.find(item => item.sku === sku);
    
    if (found) {
      log(`\n✅ พบใน Insights:`, 'green');
      log(`  - Product: ${found.productName}`, 'blue');
      log(`  - SKU: ${found.sku}`, 'blue');
      log(`  - Current Stock: ${found.currentStock || found.stockOnHand || 'N/A'}`, 'blue');
      return found.currentStock || found.stockOnHand;
    } else {
      log(`  ⚠️ ไม่พบใน Insights (อาจไม่อยู่ใน lowStock/fastMovers/deadStock)`, 'yellow');
      return null;
    }
  } catch (error) {
    log(`  ❌ เรียก Insights ล้มเหลว: ${error.message}`, 'red');
    return null;
  }
}

// =============== Test Scenarios ===============

async function testScenario1_AdjustStock() {
  log('\n' + '='.repeat(60), 'cyan');
  log('📝 Scenario 1: ทดสอบการปรับสต็อกและตรวจสอบความสอดคล้อง', 'cyan');
  log('='.repeat(60), 'cyan');
  
  const TEST_SKU = process.env.TEST_SKU || 'XSR-MOM-PG-N-2XL';
  
  try {
    // 1. ค้นหาสินค้า
    const result = await findVariantBySKU(TEST_SKU);
    if (!result) {
      log(`❌ ไม่พบ SKU: ${TEST_SKU}`, 'red');
      log(`💡 กรุณาตั้งค่า TEST_SKU environment variable เป็น SKU ที่ต้องการทดสอบ`, 'yellow');
      return;
    }
    
    const { product, variant } = result;
    log(`\n✅ พบสินค้า:`, 'green');
    log(`  - Product: ${product.name}`, 'blue');
    log(`  - SKU: ${variant.sku}`, 'blue');
    log(`  - Current Stock: ${variant.stockOnHand}`, 'blue');
    
    // 2. ตรวจสอบ batches ก่อนทำการทดสอบ
    const before = await inspectBatches(product._id, variant._id, variant.sku);
    
    // 3. ตรวจสอบ Movement History
    await checkMovementHistory(variant.sku);
    
    // 4. ตรวจสอบใน Dashboard/Insights
    const insightsStock = await checkDashboard(variant.sku);
    
    if (insightsStock !== null && insightsStock !== before.virtualStockOnHand) {
      log(`\n⚠️ ข้อมูลไม่ตรงกัน!`, 'yellow');
      log(`  - Product Query: ${before.virtualStockOnHand}`, 'red');
      log(`  - Insights: ${insightsStock}`, 'red');
    }
    
    // 5. ทดสอบปรับสต็อก +10
    log('\n' + '-'.repeat(60), 'cyan');
    log('🧪 ทดสอบ: เพิ่มสต็อก +10 ชิ้น', 'cyan');
    await adjustStock(product._id, variant._id, variant.sku, 10, 'adjust', 'Test: เพิ่มสต็อก');
    
    // 6. ตรวจสอบหลังปรับ
    await new Promise(resolve => setTimeout(resolve, 1000)); // รอ 1 วินาที
    const afterIncrease = await inspectBatches(product._id, variant._id, variant.sku);
    
    if (afterIncrease.virtualStockOnHand === before.virtualStockOnHand + 10) {
      log(`\n✅ การเพิ่มสต็อกถูกต้อง! ${before.virtualStockOnHand} → ${afterIncrease.virtualStockOnHand}`, 'green');
    } else {
      log(`\n❌ การเพิ่มสต็อกผิดพลาด! คาดว่า ${before.virtualStockOnHand + 10} แต่ได้ ${afterIncrease.virtualStockOnHand}`, 'red');
    }
    
    // 7. ทดสอบปรับสต็อก -10 (คืนกลับ)
    log('\n' + '-'.repeat(60), 'cyan');
    log('🧪 ทดสอบ: ลดสต็อก -10 ชิ้น (คืนกลับ)', 'cyan');
    await adjustStock(product._id, variant._id, variant.sku, -10, 'adjust', 'Test: ลดสต็อก');
    
    // 8. ตรวจสอบหลังปรับกลับ
    await new Promise(resolve => setTimeout(resolve, 1000));
    const afterDecrease = await inspectBatches(product._id, variant._id, variant.sku);
    
    if (afterDecrease.virtualStockOnHand === before.virtualStockOnHand) {
      log(`\n✅ การลดสต็อกถูกต้อง! คืนกลับเป็น ${afterDecrease.virtualStockOnHand}`, 'green');
    } else {
      log(`\n❌ การลดสต็อกผิดพลาด! คาดว่า ${before.virtualStockOnHand} แต่ได้ ${afterDecrease.virtualStockOnHand}`, 'red');
    }
    
    // 9. ตรวจสอบ Movement History อีกครั้ง
    await checkMovementHistory(variant.sku);
    
    // 10. ตรวจสอบใน Dashboard/Insights อีกครั้ง
    const finalInsightsStock = await checkDashboard(variant.sku);
    
    if (finalInsightsStock !== null && finalInsightsStock === afterDecrease.virtualStockOnHand) {
      log(`\n✅ ข้อมูลสอดคล้องกัน!`, 'green');
      log(`  - Product Query: ${afterDecrease.virtualStockOnHand}`, 'green');
      log(`  - Insights: ${finalInsightsStock}`, 'green');
    } else if (finalInsightsStock !== null) {
      log(`\n⚠️ ข้อมูลยังไม่ตรงกัน`, 'yellow');
      log(`  - Product Query: ${afterDecrease.virtualStockOnHand}`, 'yellow');
      log(`  - Insights: ${finalInsightsStock}`, 'yellow');
    }
    
    log('\n' + '='.repeat(60), 'cyan');
    log('✅ การทดสอบเสร็จสิ้น', 'green');
    log('='.repeat(60), 'cyan');
    
  } catch (error) {
    log(`\n❌ การทดสอบล้มเหลว: ${error.message}`, 'red');
    if (error.response) {
      log(`  Response: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    }
    process.exit(1);
  }
}

// =============== Main ===============

async function main() {
  if (!AUTH_TOKEN) {
    log('❌ กรุณาตั้งค่า AUTH_TOKEN environment variable', 'red');
    log('   ตัวอย่าง: export AUTH_TOKEN="your-jwt-token"', 'yellow');
    process.exit(1);
  }
  
  log('\n🧪 Stock Consistency Test', 'cyan');
  log(`   Base URL: ${BASE_URL}`, 'blue');
  log(`   Test SKU: ${process.env.TEST_SKU || 'XSR-MOM-PG-N-2XL (default)'}`, 'blue');
  
  await testScenario1_AdjustStock();
}

main().catch(error => {
  log(`\n❌ Error: ${error.message}`, 'red');
  process.exit(1);
});

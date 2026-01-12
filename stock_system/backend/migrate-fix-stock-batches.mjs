#!/usr/bin/env node

/**
 * Migration Script: แก้ไขปัญหา batches ที่ไม่ตรงกับสต็อกจริง
 * 
 * กรณีที่แก้ไข:
 * 1. Variant ที่ batches ว่างเปล่า แต่มี movement records → สร้าง batch จาก movement ล่าสุด
 * 2. Variant ที่ผลรวม batches ไม่ตรงกับ movement ล่าสุด → ปรับ batches ให้ตรง
 * 
 * Usage:
 *   cd stock_system/backend
 *   node migrate-fix-stock-batches.mjs --dry-run    # ดูผลลัพธ์โดยไม่แก้ไขจริง
 *   node migrate-fix-stock-batches.mjs              # แก้ไขจริง (จะถาม confirmation)
 *   node migrate-fix-stock-batches.mjs --force      # แก้ไขจริงโดยไม่ถาม
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';
import fs from 'fs';

// โหลด .env จาก root directory (2 levels up)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..', '..');
const envPath = join(rootDir, '.env');

if (!fs.existsSync(envPath)) {
  console.error(`❌ ไม่พบไฟล์ .env ที่: ${envPath}`);
  console.error('   กรุณาตรวจสอบว่า .env อยู่ใน root directory ของ project');
  process.exit(1);
}

dotenv.config({ path: envPath });

// ตรวจสอบ MONGODB_URI
if (!process.env.MONGODB_URI) {
  console.error('❌ ไม่พบ MONGODB_URI ใน .env');
  console.error('   กรุณาตั้งค่า MONGODB_URI ในไฟล์ .env ที่ root directory');
  process.exit(1);
}

// Parse arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');

// Colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const log = (message, color = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

// Import Models (simplified schemas)
const { Schema } = mongoose;

const batchSchema = new Schema({
  batchRef: String,
  supplier: String,
  cost: Number,
  quantity: { type: Number, required: true },
  quantityConsumed: { type: Number, default: 0 },
  lastConsumedAt: Date,
  consumptionOrder: Array,
  expiryDate: Date,
  receivedAt: { type: Date, default: Date.now },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryOrder' },
}, { _id: true });

const variantSchema = new Schema({
  name: String,
  sku: { type: String, required: true },
  barcode: String,
  model: String,
  attributes: { type: Map, of: String, default: {} },
  price: { type: Number, default: 0 },
  cost: { type: Number, default: 0 },
  committed: { type: Number, default: 0 },
  incoming: { type: Number, default: 0 },
  reorderPoint: { type: Number, default: 0 },
  reorderQty: { type: Number, default: 0 },
  allowBackorder: { type: Boolean, default: false },
  batches: { type: [batchSchema], default: [] },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { _id: true });

variantSchema.virtual('stockOnHand').get(function () {
  return (this.batches || []).reduce((sum, batch) => sum + (batch.quantity || 0), 0);
});

variantSchema.set('toObject', { virtuals: true });
variantSchema.set('toJSON', { virtuals: true });

const productSchema = new Schema({
  name: { type: String, required: true },
  sku: String,
  description: String,
  category: String,
  brand: String,
  unit: { type: String, default: 'unit' },
  tags: [String],
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  variants: { type: [variantSchema], default: [] },
  costingMethod: { type: String, enum: ['FIFO', 'LIFO', 'WAC'], default: 'FIFO' },
  leadTimeDays: { type: Number, default: 7 },
  reorderBufferDays: { type: Number, default: 7 },
  minOrderQty: { type: Number, default: 0 },
  enableStockAlerts: { type: Boolean, default: true },
}, { timestamps: true });

const stockMovementSchema = new Schema({
  movementType: { type: String, required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: String,
  variantId: mongoose.Schema.Types.ObjectId,
  sku: String,
  quantity: { type: Number, required: true },
  previousStock: Number,
  newStock: Number,
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryOrder' },
  reference: String,
  reason: String,
  notes: String,
  batchRef: String,
  expiryDate: Date,
  unitCost: Number,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  createdByName: String,
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);
const StockMovement = mongoose.model('StockMovement', stockMovementSchema);

// ฟังก์ชันถามคำถาม
function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

// ฟังก์ชันหา movement ล่าสุดของแต่ละ variant
async function getLatestMovement(variantId) {
  const movement = await StockMovement.findOne({ variantId })
    .sort({ createdAt: -1 })
    .lean();
  return movement;
}

// ฟังก์ชันตรวจสอบและแก้ไข variant
async function analyzeAndFixVariant(product, variant, dryRun = true) {
  const batchTotal = (variant.batches || []).reduce((sum, b) => sum + (b.quantity || 0), 0);
  const latestMovement = await getLatestMovement(variant._id);
  
  const issue = {
    productId: product._id,
    productName: product.name,
    variantId: variant._id,
    sku: variant.sku,
    batchCount: (variant.batches || []).length,
    batchTotal,
    latestMovement: latestMovement ? {
      type: latestMovement.movementType,
      newStock: latestMovement.newStock,
      date: latestMovement.createdAt,
    } : null,
    action: null,
    fixed: false,
  };

  // กรณีที่ 1: ไม่มี batches เลย แต่มี movement บอกว่ามีสต็อก
  if (batchTotal === 0 && latestMovement && latestMovement.newStock > 0) {
    issue.action = 'CREATE_BATCH';
    issue.targetStock = latestMovement.newStock;
    issue.reason = `No batches but movement shows ${latestMovement.newStock} stock`;
    
    if (!dryRun) {
      // สร้าง batch ใหม่
      variant.batches = [{
        batchRef: `MIGRATION-${Date.now()}`,
        supplier: 'Stock Migration',
        cost: variant.cost || 0,
        quantity: latestMovement.newStock,
        receivedAt: new Date(),
        notes: `Created from migration based on latest movement (${new Date(latestMovement.createdAt).toISOString()})`,
      }];
      issue.fixed = true;
    }
  }
  // กรณีที่ 2: มี batches แต่ไม่ตรงกับ movement ล่าสุด
  else if (latestMovement && batchTotal !== latestMovement.newStock) {
    issue.action = 'ADJUST_BATCH';
    issue.currentStock = batchTotal;
    issue.targetStock = latestMovement.newStock;
    issue.difference = latestMovement.newStock - batchTotal;
    issue.reason = `Batch total (${batchTotal}) != Latest movement (${latestMovement.newStock})`;
    
    if (!dryRun) {
      const diff = latestMovement.newStock - batchTotal;
      
      if (diff > 0) {
        // ต้องเพิ่ม → สร้าง batch ใหม่
        variant.batches.push({
          batchRef: `MIGRATION-ADJUST-${Date.now()}`,
          supplier: 'Stock Adjustment',
          cost: variant.cost || 0,
          quantity: diff,
          receivedAt: new Date(),
          notes: `Adjustment from migration (added ${diff})`,
        });
        issue.fixed = true;
      } else if (diff < 0) {
        // ต้องลด → consume จาก batches
        let remainingToReduce = Math.abs(diff);
        const sortedBatches = [...variant.batches].sort((a, b) => 
          new Date(a.receivedAt) - new Date(b.receivedAt) // FIFO
        );
        
        for (const batch of sortedBatches) {
          if (remainingToReduce <= 0) break;
          
          const reduceFromThis = Math.min(batch.quantity, remainingToReduce);
          batch.quantity -= reduceFromThis;
          remainingToReduce -= reduceFromThis;
        }
        
        // ลบ batches ที่เหลือ 0
        variant.batches = variant.batches.filter(b => b.quantity > 0);
        issue.fixed = true;
      }
    }
  }
  // กรณีที่ 3: ไม่มี movement แต่มี batches (ปกติ - ไม่ต้องแก้)
  else if (!latestMovement && batchTotal > 0) {
    issue.action = 'NO_ACTION';
    issue.reason = 'Has batches but no movement records (normal for old stock)';
  }
  // กรณีที่ 4: ข้อมูลตรงกัน
  else if (latestMovement && batchTotal === latestMovement.newStock) {
    issue.action = 'NO_ACTION';
    issue.reason = 'Batch total matches latest movement (consistent)';
  }
  // กรณีที่ 5: ไม่มีทั้ง batches และ movement (สินค้าใหม่หรือไม่มีสต็อก)
  else {
    issue.action = 'NO_ACTION';
    issue.reason = 'No batches and no movement (new product or never had stock)';
  }

  return issue;
}

// Main function
async function migrate() {
  log('\n' + '='.repeat(70), 'cyan');
  log('🔧 Stock Batches Migration Script', 'cyan');
  log('='.repeat(70), 'cyan');
  log(`\nMode: ${isDryRun ? '🔍 DRY RUN (ไม่แก้ไขจริง)' : '✏️  LIVE RUN (แก้ไขจริง)'}`, isDryRun ? 'yellow' : 'red');
  log(`Database: ${process.env.MONGODB_URI.replace(/:[^:@]+@/, ':****@')}`, 'blue');
  
  try {
    // เชื่อมต่อ MongoDB
    log('\n📡 กำลังเชื่อมต่อ MongoDB...', 'cyan');
    await mongoose.connect(process.env.MONGODB_URI);
    log('✅ เชื่อมต่อสำเร็จ', 'green');

    // ดึงสินค้าทั้งหมด
    log('\n📦 กำลังโหลดสินค้า...', 'cyan');
    const products = await Product.find({});
    log(`✅ พบ ${products.length} สินค้า`, 'green');

    // วิเคราะห์แต่ละ variant
    log('\n🔍 กำลังวิเคราะห์ variants...', 'cyan');
    const issues = [];
    let totalVariants = 0;
    let variantsWithIssues = 0;

    for (const product of products) {
      for (const variant of product.variants || []) {
        totalVariants++;
        const issue = await analyzeAndFixVariant(product, variant, isDryRun);
        
        if (issue.action !== 'NO_ACTION') {
          issues.push(issue);
          variantsWithIssues++;
        }
        
        // แสดงความคืบหน้า
        if (totalVariants % 50 === 0) {
          process.stdout.write(`\r   ตรวจสอบแล้ว ${totalVariants} variants...`);
        }
      }
    }
    
    process.stdout.write('\r' + ' '.repeat(50) + '\r');
    log(`✅ ตรวจสอบเสร็จ ${totalVariants} variants`, 'green');
    log(`   พบปัญหา: ${variantsWithIssues} variants`, variantsWithIssues > 0 ? 'yellow' : 'green');

    // แสดงรายละเอียดปัญหา
    if (issues.length > 0) {
      log('\n' + '='.repeat(70), 'yellow');
      log('📋 รายการที่ต้องแก้ไข:', 'yellow');
      log('='.repeat(70), 'yellow');

      const createBatchIssues = issues.filter(i => i.action === 'CREATE_BATCH');
      const adjustBatchIssues = issues.filter(i => i.action === 'ADJUST_BATCH');

      if (createBatchIssues.length > 0) {
        log(`\n🆕 สร้าง Batch ใหม่ (${createBatchIssues.length} รายการ):`, 'cyan');
        createBatchIssues.slice(0, 10).forEach((issue, idx) => {
          log(`   ${idx + 1}. ${issue.productName} (${issue.sku})`, 'blue');
          log(`      → สร้าง batch: ${issue.targetStock} ชิ้น`, 'blue');
          log(`      → เหตุผล: ${issue.reason}`, 'blue');
        });
        if (createBatchIssues.length > 10) {
          log(`   ... และอีก ${createBatchIssues.length - 10} รายการ`, 'blue');
        }
      }

      if (adjustBatchIssues.length > 0) {
        log(`\n🔧 ปรับ Batch (${adjustBatchIssues.length} รายการ):`, 'cyan');
        adjustBatchIssues.slice(0, 10).forEach((issue, idx) => {
          log(`   ${idx + 1}. ${issue.productName} (${issue.sku})`, 'blue');
          log(`      → ปัจจุบัน: ${issue.currentStock} → เป้าหมาย: ${issue.targetStock} (${issue.difference > 0 ? '+' : ''}${issue.difference})`, 'blue');
          log(`      → เหตุผล: ${issue.reason}`, 'blue');
        });
        if (adjustBatchIssues.length > 10) {
          log(`   ... และอีก ${adjustBatchIssues.length - 10} รายการ`, 'blue');
        }
      }

      // ถ้าเป็น dry-run ให้แสดงคำแนะนำ
      if (isDryRun) {
        log('\n' + '='.repeat(70), 'yellow');
        log('💡 นี่เป็นโหมด DRY RUN - ข้อมูลยังไม่ถูกแก้ไข', 'yellow');
        log('   หากต้องการแก้ไขจริง ให้รันคำสั่ง:', 'yellow');
        log('   node migrate-fix-stock-batches.mjs', 'green');
        log('='.repeat(70), 'yellow');
      } else {
        // ถามยืนยันก่อนบันทึก
        if (!isForce) {
          log('\n' + '='.repeat(70), 'red');
          log('⚠️  คำเตือน: กำลังจะแก้ไขข้อมูลในฐานข้อมูล!', 'red');
          log('='.repeat(70), 'red');
          const answer = await askQuestion('\nต้องการดำเนินการต่อหรือไม่? (yes/no): ');
          
          if (answer !== 'yes' && answer !== 'y') {
            log('\n❌ ยกเลิกการแก้ไข', 'yellow');
            await mongoose.disconnect();
            process.exit(0);
          }
        }

        // บันทึกการแก้ไข
        log('\n💾 กำลังบันทึกการแก้ไข...', 'cyan');
        let savedCount = 0;
        
        for (const product of products) {
          let modified = false;
          
          for (const variant of product.variants || []) {
            const issue = issues.find(i => 
              String(i.variantId) === String(variant._id)
            );
            
            if (issue && issue.fixed) {
              modified = true;
            }
          }
          
          if (modified) {
            product.markModified('variants');
            await product.save();
            savedCount++;
          }
        }

        log(`✅ บันทึกสำเร็จ ${savedCount} สินค้า`, 'green');
        log(`✅ แก้ไขสำเร็จ ${variantsWithIssues} variants`, 'green');
      }

      // สร้างไฟล์ log
      const logFileName = `migration-log-${Date.now()}.json`;
      fs.writeFileSync(
        logFileName,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          mode: isDryRun ? 'DRY_RUN' : 'LIVE_RUN',
          totalVariants,
          variantsWithIssues,
          issues,
        }, null, 2)
      );
      log(`\n📄 บันทึก log ไปที่: ${logFileName}`, 'blue');
    } else {
      log('\n✅ ไม่พบปัญหา - ข้อมูลทั้งหมดถูกต้อง', 'green');
    }

  } catch (error) {
    log(`\n❌ เกิดข้อผิดพลาด: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    log('\n👋 ปิดการเชื่อมต่อ MongoDB', 'cyan');
  }

  log('\n' + '='.repeat(70), 'cyan');
  log('✅ Migration เสร็จสิ้น', 'green');
  log('='.repeat(70), 'cyan');
}

// Run
migrate().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

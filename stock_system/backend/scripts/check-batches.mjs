#!/usr/bin/env node
/**
 * Check Product Batch Data - ตรวจสอบความถูกต้องของ batch
 * 
 * ตรวจสอบ:
 * 1. ผลรวมของ batch.quantity = variant.stockOnHand หรือไม่
 * 2. Batch ที่ orphaned (ไม่มี orderId reference)
 * 3. Batch ที่เกี่ยวข้องกับ cancelled orders
 */

import { loadEnv } from '../utils/loadEnv.js';
loadEnv('../../..');

import mongoose from 'mongoose';
import Product from '../models/Product.js';
import InventoryOrder from '../models/InventoryOrder.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/stock_system';

async function checkBatches() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    // ดึง cancelled orders
    const cancelledOrders = await InventoryOrder.find({ status: 'cancelled' }).lean();
    const cancelledOrderIds = new Set(cancelledOrders.map(o => String(o._id)));

    console.log(`📦 Found ${cancelledOrders.length} cancelled orders\n`);

    // ดึงทุก products (ไม่ใช้ .lean() เพื่อให้ virtual fields ทำงาน)
    const products = await Product.find();
    console.log(`📊 Found ${products.length} products\n`);

    const report = {
      totalVariants: 0,
      variantsWithBatches: 0,
      batchMismatches: [],
      orphanedBatches: [],
      cancelledOrderBatches: [],
      batchSummary: {
        totalBatches: 0,
        totalQuantity: 0,
      }
    };

    for (const product of products) {
      for (const variant of product.variants || []) {
        report.totalVariants++;
        
        const batches = variant.batches || [];
        if (batches.length === 0) continue;

        report.variantsWithBatches++;
        
        const stockOnHand = variant.stockOnHand || 0;
        const batchTotalQty = batches.reduce((sum, b) => sum + (b.quantity || 0), 0);
        
        report.batchSummary.totalBatches += batches.length;
        report.batchSummary.totalQuantity += batchTotalQty;

        // ตรวจสอบ 1: ผลรวม batch = stockOnHand?
        if (Math.abs(batchTotalQty - stockOnHand) > 0.01) {
          report.batchMismatches.push({
            productName: product.name,
            sku: variant.sku,
            stockOnHand,
            batchTotalQty,
            diff: stockOnHand - batchTotalQty,
            batchCount: batches.length,
          });
        }

        // ตรวจสอบ 2 & 3: Orphaned/Cancelled batches
        for (const batch of batches) {
          // ตรวจสอบ batch ที่ orphaned
          if (!batch.orderId && !batch.batchRef) {
            report.orphanedBatches.push({
              productName: product.name,
              sku: variant.sku,
              batchRef: batch.batchRef || 'NO_REF',
              quantity: batch.quantity,
              supplier: batch.supplier,
              receivedAt: batch.receivedAt,
            });
          }

          // ตรวจสอบ batch ที่เกี่ยวข้องกับ cancelled orders
          if (batch.orderId && cancelledOrderIds.has(String(batch.orderId))) {
            report.cancelledOrderBatches.push({
              productName: product.name,
              sku: variant.sku,
              batchRef: batch.batchRef,
              quantity: batch.quantity,
              orderId: String(batch.orderId),
              supplier: batch.supplier,
              status: '❌ SHOULD BE REMOVED',
            });
          }
        }
      }
    }

    console.log('='  .repeat(80));
    console.log('BATCH DATA VERIFICATION REPORT');
    console.log('='  .repeat(80));

    console.log('\n📊 Summary:');
    console.log(`   Total variants: ${report.totalVariants}`);
    console.log(`   Variants with batches: ${report.variantsWithBatches}`);
    console.log(`   Total batches: ${report.batchSummary.totalBatches}`);
    console.log(`   Total batch quantity: ${report.batchSummary.totalQuantity}`);

    // ✅ Mismatch Report
    if (report.batchMismatches.length > 0) {
      console.log(`\n⚠️  MISMATCH - Stock vs Batches (${report.batchMismatches.length} items):`);
      console.log('    (stockOnHand ≠ sum of batch quantities)\n');
      console.table(report.batchMismatches);
    } else {
      console.log('\n✅ Stock vs Batches: All matched correctly!');
    }

    // ⚠️ Orphaned Batches
    if (report.orphanedBatches.length > 0) {
      console.log(`\n⚠️  ORPHANED BATCHES (${report.orphanedBatches.length} items):`);
      console.log('    (batches without orderId or batchRef)\n');
      console.table(report.orphanedBatches);
    } else {
      console.log('\n✅ Orphaned batches: None found!');
    }

    // ❌ Cancelled Order Batches
    if (report.cancelledOrderBatches.length > 0) {
      console.log(`\n❌ BATCHES FROM CANCELLED ORDERS (${report.cancelledOrderBatches.length} items):`);
      console.log('    (these should be removed or hidden)\n');
      console.table(report.cancelledOrderBatches);
    } else {
      console.log('\n✅ Cancelled order batches: None found!');
    }

    console.log('\n' + '='  .repeat(80));
    console.log('STATUS:');
    const hasIssues = report.batchMismatches.length > 0 || 
                     report.orphanedBatches.length > 0 || 
                     report.cancelledOrderBatches.length > 0;
    
    if (!hasIssues) {
      console.log('✅ ALL CHECKS PASSED - Batch data looks good!');
    } else {
      console.log('⚠️  FOUND ISSUES - Review report above');
      if (report.batchMismatches.length > 0) {
        console.log('   - Fix: Recalculate stockOnHand or repair batches');
      }
      if (report.orphanedBatches.length > 0) {
        console.log('   - Fix: Add missing orderId or batchRef, or remove');
      }
      if (report.cancelledOrderBatches.length > 0) {
        console.log('   - Fix: Run filter script to hide cancelled batches');
      }
    }
    console.log('='  .repeat(80));

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Done!');
  }
}

console.log('🔍 Product Batch Data Checker\n');
checkBatches();

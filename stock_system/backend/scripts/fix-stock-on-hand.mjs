#!/usr/bin/env node
/**
 * Fix Product StockOnHand - คำนวณ stockOnHand จาก batches
 * 
 * ปัญหา: stockOnHand = 0 แต่ batches มีจำนวน > 0
 * วิธีแก้: stockOnHand = sum of batch.quantity
 */

import { loadEnv } from '../utils/loadEnv.js';
loadEnv('../../..');

import mongoose from 'mongoose';
import Product from '../models/Product.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/stock_system';

async function fixStockOnHand() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    const products = await Product.find();
    console.log(`📊 Found ${products.length} products\n`);

    let fixedCount = 0;
    let errorCount = 0;
    const report = [];

    for (const product of products) {
      let productChanged = false;

      for (const variant of product.variants || []) {
        const batches = variant.batches || [];
        
        // คำนวณผลรวม batch quantity
        const batchTotal = batches.reduce((sum, b) => sum + (b.quantity || 0), 0);
        const currentStock = variant.stockOnHand || 0;

        if (Math.abs(batchTotal - currentStock) > 0.01) {
          // มีความแตกต่าง
          report.push({
            productName: product.name,
            sku: variant.sku,
            oldStockOnHand: currentStock,
            newStockOnHand: batchTotal,
            batchCount: batches.length,
            diff: batchTotal - currentStock,
          });

          // อัพเดต
          variant.stockOnHand = batchTotal;
          productChanged = true;
          fixedCount++;
        }
      }

      if (productChanged) {
        try {
          product.markModified('variants');
          await product.save();
        } catch (err) {
          console.error(`❌ Error saving product ${product.name}:`, err.message);
          errorCount++;
        }
      }
    }

    console.log(`\n✅ Fixed: ${fixedCount} variants`);
    console.log(`❌ Errors: ${errorCount}\n`);

    if (report.length > 0) {
      console.log('📋 Changed items:\n');
      console.table(report);
    } else {
      console.log('✨ No changes needed!\n');
    }

    // สรุป
    console.log('='  .repeat(80));
    console.log('Summary:');
    console.log('- Total variants fixed:', fixedCount);
    console.log('- Errors:', errorCount);
    console.log('='  .repeat(80));

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Done!');
  }
}

console.log('🚀 Fix StockOnHand from Batches\n');
fixStockOnHand();

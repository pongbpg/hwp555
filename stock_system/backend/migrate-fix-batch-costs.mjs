/**
 * Migration Script: แก้ batch cost = 0
 * 
 * สาเหตุ: ตอน receive purchase order, frontend ไม่ส่ง unitCost
 *          backend เดิมใช้ receiveData.unitCost || 0 → batch ได้ cost = 0
 * 
 * วิธีแก้:
 *   1. หา batch ที่ cost = 0 หรือ null/undefined
 *   2. ใช้ batch.orderId ดึง purchase order → item.unitCost / item.unitPrice
 *   3. ถ้ายังไม่มี fallback ไป variant.cost
 *   4. อัพเดต batch.cost
 *   
 *   + แก้ sale order items ที่ unitCost = 0 ด้วย
 * 
 * วิธีรัน: cd stock_system/backend && node migrate-fix-batch-costs.mjs
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI =  process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env');
  process.exit(1);
}

// ── Schemas (minimal, matching existing models) ──
const batchSchema = new mongoose.Schema({
  batchRef: String,
  supplier: String,
  cost: Number,
  quantity: Number,
  expiryDate: Date,
  receivedAt: Date,
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryOrder' },
}, { _id: true });

const variantSchema = new mongoose.Schema({
  sku: String,
  cost: { type: Number, default: 0 },
  batches: [batchSchema],
}, { _id: true });

const productSchema = new mongoose.Schema({
  name: String,
  variants: [variantSchema],
});

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId },
  variantId: { type: mongoose.Schema.Types.ObjectId },
  sku: String,
  unitPrice: { type: Number, default: 0 },
  unitCost: { type: Number, default: 0 },
  quantity: Number,
}, { _id: true });

const inventoryOrderSchema = new mongoose.Schema({
  type: String,
  status: String,
  items: [orderItemSchema],
});

const Product = mongoose.model('Product', productSchema);
const InventoryOrder = mongoose.model('InventoryOrder', inventoryOrderSchema);

// ── Main ──
async function main() {
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected\n');

  // ═══════════════════════════════════════════
  // PHASE 1: Fix batch costs = 0
  // ═══════════════════════════════════════════
  console.log('═══════════════════════════════════════');
  console.log('📦 PHASE 1: Fix batch costs');
  console.log('═══════════════════════════════════════\n');

  const products = await Product.find({ 'variants.batches': { $exists: true, $not: { $size: 0 } } });
  
  let batchesFixed = 0;
  let batchesSkipped = 0;
  let batchesAlreadyOk = 0;

  // Cache purchase orders for lookup
  const orderCache = new Map();
  
  for (const product of products) {
    let productChanged = false;

    for (const variant of product.variants) {
      for (const batch of variant.batches) {
        // Skip BACKORDER batches
        if (batch.batchRef?.startsWith('BACKORDER-')) continue;

        // Skip batches that already have cost > 0
        if (batch.cost && batch.cost > 0) {
          batchesAlreadyOk++;
          continue;
        }

        // ── Try to find cost from original purchase order ──
        let newCost = 0;
        
        if (batch.orderId) {
          let order = orderCache.get(String(batch.orderId));
          if (!order) {
            order = await InventoryOrder.findById(batch.orderId);
            if (order) orderCache.set(String(batch.orderId), order);
          }

          if (order) {
            // Find matching item by variantId
            const matchItem = order.items.find(
              it => String(it.variantId) === String(variant._id)
            );
            if (matchItem) {
              newCost = matchItem.unitCost || matchItem.unitPrice || 0;
            }
          }
        }

        // Fallback to variant.cost
        if (!newCost && variant.cost > 0) {
          newCost = variant.cost;
        }

        if (newCost > 0) {
          console.log(`  ✅ ${product.name} / ${variant.sku} / batch ${batch.batchRef}: 0 → ${newCost}`);
          batch.cost = newCost;
          productChanged = true;
          batchesFixed++;
        } else {
          console.log(`  ⚠️  ${product.name} / ${variant.sku} / batch ${batch.batchRef}: cost=0 แต่หาต้นทุนไม่ได้`);
          batchesSkipped++;
        }
      }
    }

    if (productChanged) {
      await product.save();
    }
  }

  console.log(`\n📊 Phase 1 Summary:`);
  console.log(`   ✅ Batches fixed: ${batchesFixed}`);
  console.log(`   ⚠️  Batches skipped (no cost source): ${batchesSkipped}`);
  console.log(`   ✓  Batches already OK: ${batchesAlreadyOk}\n`);

  // ═══════════════════════════════════════════
  // PHASE 1.5: Fix variant.cost = 0 from purchase orders
  // ═══════════════════════════════════════════
  console.log('═══════════════════════════════════════');
  console.log('🔧 PHASE 1.5: Fix variant.cost from purchase orders');
  console.log('═══════════════════════════════════════\n');

  let variantCostFixed = 0;
  const allProducts = await Product.find({});
  
  for (const product of allProducts) {
    let productChanged = false;
    
    for (const variant of product.variants) {
      if (variant.cost > 0) continue; // already has cost
      
      // Find the latest completed/pending purchase order with this variant's cost
      const po = await InventoryOrder.findOne({
        type: 'purchase',
        'items.variantId': variant._id,
      }).sort({ _id: -1 }); // newest first
      
      if (po) {
        const poItem = po.items.find(it => String(it.variantId) === String(variant._id));
        const poCost = poItem?.unitCost || poItem?.unitPrice || 0;
        if (poCost > 0) {
          console.log(`  ✅ ${product.name} / ${variant.sku}: variant.cost 0 → ${poCost} (from PO ${po._id})`);
          variant.cost = poCost;
          productChanged = true;
          variantCostFixed++;
        }
      }
    }
    
    if (productChanged) {
      await product.save();
    }
  }

  console.log(`\n📊 Phase 1.5 Summary:`);
  console.log(`   ✅ Variant costs fixed: ${variantCostFixed}\n`);

  // ═══════════════════════════════════════════
  // PHASE 2: Fix sale order items with unitCost = 0
  // ═══════════════════════════════════════════
  console.log('═══════════════════════════════════════');
  console.log('🧾 PHASE 2: Fix sale order unitCost');
  console.log('═══════════════════════════════════════\n');

  const saleOrders = await InventoryOrder.find({
    type: 'sale',
    status: { $ne: 'cancelled' },
    'items.unitCost': 0,
  });

  let saleItemsFixed = 0;
  let saleItemsSkipped = 0;

  // Cache products for variant cost lookup
  const productCache = new Map();

  for (const order of saleOrders) {
    let orderChanged = false;

    for (const item of order.items) {
      if (item.unitCost > 0) continue;

      // ── Find variant cost ──
      let product = productCache.get(String(item.productId));
      if (!product) {
        product = await Product.findById(item.productId);
        if (product) productCache.set(String(item.productId), product);
      }

      if (!product) {
        console.log(`  ⚠️  Order ${order._id} / ${item.sku}: product not found`);
        saleItemsSkipped++;
        continue;
      }

      const variant = product.variants.id(item.variantId);
      if (!variant) {
        console.log(`  ⚠️  Order ${order._id} / ${item.sku}: variant not found`);
        saleItemsSkipped++;
        continue;
      }

      // Try to get cost from valid (non-backorder, positive qty) batches
      let bestCost = 0;
      const validBatches = (variant.batches || []).filter(
        b => (b.cost || 0) > 0 && !b.batchRef?.startsWith('BACKORDER-')
      );

      if (validBatches.length > 0) {
        // Use oldest batch cost (FIFO default)
        const oldest = validBatches.reduce((o, b) =>
          new Date(b.receivedAt || 0) < new Date(o.receivedAt || 0) ? b : o
        );
        bestCost = oldest.cost;
      }

      // Fallback to variant.cost
      if (!bestCost && variant.cost > 0) {
        bestCost = variant.cost;
      }

      // Fallback to purchase order cost
      if (!bestCost) {
        const po = await InventoryOrder.findOne({
          type: 'purchase',
          'items.variantId': item.variantId,
        }).sort({ _id: -1 });
        if (po) {
          const poItem = po.items.find(it => String(it.variantId) === String(item.variantId));
          bestCost = poItem?.unitCost || poItem?.unitPrice || 0;
        }
      }

      if (bestCost > 0) {
        console.log(`  ✅ Sale ${order._id} / ${item.sku}: unitCost 0 → ${bestCost}`);
        item.unitCost = bestCost;
        orderChanged = true;
        saleItemsFixed++;
      } else {
        console.log(`  ⚠️  Sale ${order._id} / ${item.sku}: unitCost=0 แต่หาต้นทุนไม่ได้`);
        saleItemsSkipped++;
      }
    }

    if (orderChanged) {
      await order.save();
    }
  }

  console.log(`\n📊 Phase 2 Summary:`);
  console.log(`   ✅ Sale items fixed: ${saleItemsFixed}`);
  console.log(`   ⚠️  Sale items skipped (no cost source): ${saleItemsSkipped}\n`);

  // ═══════════════════════════════════════════
  // PHASE 3: Fix sale orders where unitCost = unitPrice (ต้นทุน = ราคาขาย → ผิด)
  // สาเหตุ: BACKORDER batch ใช้ item.unitPrice เป็น cost
  // ═══════════════════════════════════════════
  console.log('═══════════════════════════════════════');
  console.log('🔄 PHASE 3: Fix sale unitCost = unitPrice (wrong backorder cost)');
  console.log('═══════════════════════════════════════\n');

  const allSaleOrders = await InventoryOrder.find({
    type: 'sale',
    status: { $ne: 'cancelled' },
  });

  let phase3Fixed = 0;
  let phase3Skipped = 0;

  for (const order of allSaleOrders) {
    let orderChanged = false;

    for (const item of order.items) {
      // ตรวจจับ: unitCost > 0 และ unitCost === unitPrice (ราคาขายเท่ากับต้นทุน → น่าสงสัย)
      if (!item.unitCost || !item.unitPrice) continue;
      if (item.unitCost !== item.unitPrice) continue;
      
      // ดึงต้นทุนจริงจาก variant.cost หรือ PO
      let product = productCache.get(String(item.productId));
      if (!product) {
        product = await Product.findById(item.productId);
        if (product) productCache.set(String(item.productId), product);
      }
      if (!product) continue;

      const variant = product.variants.id(item.variantId);
      if (!variant) continue;

      // หาต้นทุนจริง
      let realCost = 0;

      // จาก valid batches
      const validBatches = (variant.batches || []).filter(
        b => (b.cost || 0) > 0 && !b.batchRef?.startsWith('BACKORDER-')
      );
      if (validBatches.length > 0) {
        const oldest = validBatches.reduce((o, b) =>
          new Date(b.receivedAt || 0) < new Date(o.receivedAt || 0) ? b : o
        );
        realCost = oldest.cost;
      }

      // Fallback variant.cost
      if (!realCost && variant.cost > 0) realCost = variant.cost;

      // Fallback PO
      if (!realCost) {
        const po = await InventoryOrder.findOne({
          type: 'purchase',
          'items.variantId': item.variantId,
        }).sort({ _id: -1 });
        if (po) {
          const poItem = po.items.find(it => String(it.variantId) === String(item.variantId));
          realCost = poItem?.unitCost || poItem?.unitPrice || 0;
        }
      }

      // ถ้าต้นทุนจริงต่างจาก unitCost ปัจจุบัน → แก้ไข
      if (realCost > 0 && realCost !== item.unitCost) {
        console.log(`  ✅ Sale ${order._id} / ${item.sku}: unitCost ${item.unitCost} (=unitPrice) → ${realCost}`);
        item.unitCost = realCost;
        orderChanged = true;
        phase3Fixed++;
      } else if (realCost === 0) {
        console.log(`  ⚠️  Sale ${order._id} / ${item.sku}: unitCost=${item.unitCost} (=unitPrice) แต่หาต้นทุนจริงไม่ได้`);
        phase3Skipped++;
      }
    }

    if (orderChanged) {
      await order.save();
    }
  }

  console.log(`\n📊 Phase 3 Summary:`);
  console.log(`   ✅ Items fixed (unitCost was = unitPrice): ${phase3Fixed}`);
  console.log(`   ⚠️  Items skipped: ${phase3Skipped}\n`);

  // ═══════════════════════════════════════════
  // PHASE 4: Fix BACKORDER batches with wrong cost (= unitPrice)
  // ═══════════════════════════════════════════
  console.log('═══════════════════════════════════════');
  console.log('📦 PHASE 4: Fix BACKORDER batch costs');
  console.log('═══════════════════════════════════════\n');

  let backorderFixed = 0;
  const allProductsPhase4 = await Product.find({ 'variants.batches.batchRef': /^BACKORDER-/ });

  for (const product of allProductsPhase4) {
    let productChanged = false;

    for (const variant of product.variants) {
      for (const batch of variant.batches) {
        if (!batch.batchRef?.startsWith('BACKORDER-')) continue;
        if (!batch.cost || batch.cost === 0) continue; // cost=0 ไม่ต้องแก้ (ปกติ)

        // หาต้นทุนจริง
        let realCost = variant.cost || 0;
        if (!realCost) {
          const po = await InventoryOrder.findOne({
            type: 'purchase',
            'items.variantId': variant._id,
          }).sort({ _id: -1 });
          if (po) {
            const poItem = po.items.find(it => String(it.variantId) === String(variant._id));
            realCost = poItem?.unitCost || poItem?.unitPrice || 0;
          }
        }

        // ถ้า BACKORDER batch cost สูงกว่าต้นทุนจริงมาก → น่าจะเป็นราคาขาย
        if (realCost > 0 && batch.cost > realCost * 1.5) {
          console.log(`  ✅ ${product.name} / ${variant.sku} / ${batch.batchRef}: cost ${batch.cost} → ${realCost}`);
          batch.cost = realCost;
          productChanged = true;
          backorderFixed++;
        }
      }
    }

    if (productChanged) {
      await product.save();
    }
  }

  console.log(`\n📊 Phase 4 Summary:`);
  console.log(`   ✅ BACKORDER batches fixed: ${backorderFixed}\n`);

  // ═══════════════════════════════════════════
  // DONE
  // ═══════════════════════════════════════════
  console.log('═══════════════════════════════════════');
  console.log('🎉 Migration complete!');
  console.log('═══════════════════════════════════════');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});

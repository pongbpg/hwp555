import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';

// ======================= Models =======================
const productSchema = new mongoose.Schema({
  name: String,
  costingMethod: { type: String, enum: ['FIFO', 'LIFO', 'WAC'], default: 'FIFO' },
  variants: [{
    _id: mongoose.Schema.Types.ObjectId,
    sku: String,
    cost: Number,
    price: Number,
    batches: [{
      batchRef: String,
      cost: Number,
      quantity: Number,
      receivedAt: Date,
    }]
  }]
}, { timestamps: true });

const inventoryOrderSchema = new mongoose.Schema({
  type: { type: String, enum: ['sale', 'purchase', 'adjustment'] },
  status: String,
  reference: String,
  items: [{
    productId: mongoose.Schema.Types.ObjectId,
    variantId: mongoose.Schema.Types.ObjectId,
    sku: String,
    quantity: Number,
    unitPrice: Number,
    unitCost: Number,  // This is what we need to populate
    productName: String,
  }]
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema, 'products');
const InventoryOrder = mongoose.model('InventoryOrder', inventoryOrderSchema, 'inventoryorders');

// ======================= Migration Logic =======================
async function migrate() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    console.log(`   URI: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const orders = await InventoryOrder.find();
    console.log(`📦 Found ${orders.length} orders\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const order of orders) {
      let orderUpdated = false;

      for (let itemIdx = 0; itemIdx < (order.items || []).length; itemIdx++) {
        const item = order.items[itemIdx];

        // ✅ Handle SALE orders: get unitCost from batch
        if (order.type === 'sale') {
          // Skip if unitCost already exists
          if (item.unitCost && item.unitCost > 0) {
            console.log(`⏭️  Skipped: ${item.sku} - unitCost already exists (${item.unitCost})`);
            skippedCount++;
            continue;
          }

          // Find product
          const product = await Product.findById(item.productId);
          if (!product) {
            console.log(`❌ Product not found for item ${item.sku}`);
            skippedCount++;
            continue;
          }

          // Find variant
          const variant = product.variants.id(item.variantId);
          if (!variant) {
            console.log(`❌ Variant not found for SKU ${item.sku}`);
            skippedCount++;
            continue;
          }

          // Calculate unitCost based on costingMethod
          let unitCost = 0;
          const costingMethod = product.costingMethod || 'FIFO';

          if (variant.batches && variant.batches.length > 0) {
            let batchToUse;

            if (costingMethod === 'LIFO') {
              // LIFO: newest batch (max receivedAt)
              batchToUse = variant.batches.reduce((latest, b) =>
                (new Date(b.receivedAt || 0) > new Date(latest.receivedAt || 0)) ? b : latest
              );
            } else {
              // FIFO (default): oldest batch (min receivedAt)
              batchToUse = variant.batches.reduce((oldest, b) =>
                (new Date(b.receivedAt || 0) < new Date(oldest.receivedAt || 0)) ? b : oldest
              );
            }

            unitCost = batchToUse?.cost || 0;
          }

          // Fallback to variant cost
          if (unitCost === 0) {
            unitCost = variant.cost || 0;
          }

          // Update item
          order.items[itemIdx].unitCost = unitCost;
          orderUpdated = true;

          console.log(`✅ Sale: ${item.sku} (${costingMethod}) - unitCost = ${unitCost}`);
        }

        // ✅ Handle PURCHASE & ADJUSTMENT orders: convert unitPrice to unitCost
        if (order.type === 'purchase' || order.type === 'adjustment') {
          const unitPrice = item.unitPrice || 0;
          
          // Only update if unitPrice exists and unitCost is 0
          if (unitPrice > 0 && (!item.unitCost || item.unitCost === 0)) {
            order.items[itemIdx].unitCost = unitPrice;
            order.items[itemIdx].unitPrice = 0;
            orderUpdated = true;

            console.log(`✅ ${order.type.toUpperCase()}: ${item.sku} - converted unitPrice ${unitPrice} → unitCost`);
          } else if (item.unitCost && item.unitCost > 0) {
            // unitCost already exists, clear unitPrice
            if (item.unitPrice && item.unitPrice > 0) {
              order.items[itemIdx].unitPrice = 0;
              orderUpdated = true;
              console.log(`✅ ${order.type.toUpperCase()}: ${item.sku} - cleared unitPrice (unitCost already ${item.unitCost})`);
            } else {
              console.log(`⏭️  Skipped: ${item.sku} - already has unitCost`);
              skippedCount++;
              continue;
            }
          } else {
            console.log(`⏭️  Skipped: ${item.sku} - no unitPrice or unitCost`);
            skippedCount++;
            continue;
          }
        }
      }

      // Save order if any items were updated
      if (orderUpdated) {
        await order.save();
        updatedCount++;
        console.log(`   💾 Saved order: ${order.reference || order._id}\n`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`📊 Migration Summary:`);
    console.log(`   ✅ Updated orders: ${updatedCount}`);
    console.log(`   ⏭️  Skipped items: ${skippedCount}`);
    console.log(`   📦 Total orders: ${orders.length}`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// ======================= Run Migration =======================
migrate();

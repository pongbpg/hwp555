/**
 * Migrate: Create missing StockMovements from InventoryOrders
 * สำหรับ orders ที่ไม่มี movements
 */

import mongoose from 'mongoose';
import InventoryOrder from '../models/InventoryOrder.js';
import StockMovement from '../models/StockMovement.js';
import Product from '../models/Product.js';
import Employee from '../models/Employee.js';

const MONGODB_URI = 'mongodb://mongo:KTlBvUhGjEidMDEKLAzevAVCOATaiNsU@gondola.proxy.rlwy.net:33948/test?authSource=admin';

async function createMissingMovements() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find or create System user for createdBy
    let systemUser = await Employee.findOne({ email: 'system@admin.local' });
    if (!systemUser) {
      systemUser = await Employee.create({
        firstName: 'System',
        lastName: 'Admin',
        email: 'system@admin.local',
        phone: 'N/A',
        position: 'System',
        department: 'System',
        salary: 0,
        hireDate: new Date(),
        status: 'active',
        password: 'SYSTEM_GENERATED_ACCOUNT_DO_NOT_USE', // Placeholder - system users don't login
        role: 'admin'
      });
      console.log(`✅ Created System user: ${systemUser._id}\n`);
    } else {
      console.log(`✅ Found existing System user: ${systemUser._id}\n`);
    }

    // Get all sale orders
    const orders = await InventoryOrder.find(
      { type: 'sale', status: { $ne: 'cancelled' } }
    ).sort({ orderDate: 1 });

    console.log(`Found ${orders.length} sale orders\n`);

    let created = 0;
    let skipped = 0;

    for (const order of orders) {
      for (const item of order.items) {
        // Check if movement already exists for this order item
        const existingMovement = await StockMovement.findOne({
          reference: order.reference,
          sku: item.sku,
          movementType: 'out'
        });

        if (existingMovement) {
          // Movement already exists, skip
          skipped++;
          continue;
        }

        // Get product to find correct variant
        const product = await Product.findOne({ 'variants.sku': item.sku });
        if (!product) {
          console.log(`⚠️  Product for SKU ${item.sku} not found, skipping`);
          continue;
        }

        const variant = product.variants.find(v => v.sku === item.sku);
        if (!variant) {
          console.log(`⚠️  Variant for SKU ${item.sku} not found, skipping`);
          continue;
        }

        // Get the last movement before this order to calculate previousStock
        const lastMovement = await StockMovement.findOne({
          sku: item.sku,
          createdAt: { $lt: order.orderDate }
        }).sort({ createdAt: -1 });

        const previousStock = lastMovement ? lastMovement.newStock : 0;
        const newStock = previousStock - item.quantity;

        // Create movement with all required fields
        const movement = new StockMovement({
          movementType: 'out',
          productId: product._id,
          productName: product.name,
          variantId: variant._id,
          sku: item.sku,
          quantity: -item.quantity,
          reference: order.reference,
          orderId: order._id,
          previousStock,
          newStock,
          createdBy: systemUser._id, // Use system user
          createdByName: 'System (Auto-created)',
          createdAt: order.orderDate // Use orderDate instead of current time
        });

        await movement.save();
        created++;

        console.log(`✅ Created movement: ${item.sku} -${item.quantity} (${previousStock} → ${newStock}) on ${order.orderDate.toISOString()} [${order.reference}]`);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log('─'.repeat(150));
    console.log(`Created: ${created} movements`);
    console.log(`Skipped: ${skipped} movements`);

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createMissingMovements();

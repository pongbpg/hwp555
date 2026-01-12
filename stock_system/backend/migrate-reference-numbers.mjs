import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';

// ======================= Models =======================
const inventoryOrderSchema = new mongoose.Schema({
  type: { type: String, enum: ['sale', 'purchase', 'adjustment'] },
  reference: String,
  createdAt: Date,
  items: []
}, { timestamps: true });

const InventoryOrder = mongoose.model('InventoryOrder', inventoryOrderSchema, 'inventoryorders');

// ======================= Helper Functions =======================
const getThaiYear = (date) => {
  const year = new Date(date).getFullYear();
  return year + 543;
};

const generateNewReference = (type, createdAt, sequenceNumber) => {
  const prefixes = {
    sale: 'SO',
    purchase: 'PO',
    adjustment: 'ADJ',
  };
  
  const prefix = prefixes[type] || type.toUpperCase();
  const thaiYear = getThaiYear(createdAt);
  const paddedNumber = String(sequenceNumber).padStart(4, '0');
  
  return `${prefix}${thaiYear}-${paddedNumber}`;
};

// ======================= Migration Logic =======================
async function migrate() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    console.log(`   URI: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all orders sorted by createdAt
    const allOrders = await InventoryOrder.find().sort({ createdAt: 1 });
    console.log(`📦 Found ${allOrders.length} orders\n`);

    // Group orders by type
    const ordersByType = {
      sale: [],
      purchase: [],
      adjustment: []
    };

    allOrders.forEach(order => {
      if (ordersByType[order.type]) {
        ordersByType[order.type].push(order);
      }
    });

    console.log('📊 Orders by type:');
    console.log(`   Sale: ${ordersByType.sale.length}`);
    console.log(`   Purchase: ${ordersByType.purchase.length}`);
    console.log(`   Adjustment: ${ordersByType.adjustment.length}\n`);

    let totalUpdated = 0;

    // Process each type separately
    for (const [type, orders] of Object.entries(ordersByType)) {
      if (orders.length === 0) continue;

      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing ${type.toUpperCase()} orders...`);
      console.log('='.repeat(60));

      for (let idx = 0; idx < orders.length; idx++) {
        const order = orders[idx];
        const sequenceNumber = idx + 1;
        const newReference = generateNewReference(type, order.createdAt, sequenceNumber);
        const oldReference = order.reference || '(empty)';

        // Update order
        order.reference = newReference;
        await order.save();
        totalUpdated++;

        console.log(`${sequenceNumber.toString().padStart(3, ' ')}. ${oldReference.padEnd(20)} → ${newReference}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Migration Complete`);
    console.log(`   Total updated: ${totalUpdated}`);
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

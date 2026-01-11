import mongoose from 'mongoose';
import InventoryOrder from '../models/InventoryOrder.js';

const MONGODB_URI = 'mongodb://mongo:KTlBvUhGjEidMDEKLAzevAVCOATaiNsU@gondola.proxy.rlwy.net:33948/test?authSource=admin';

async function checkOrder() {
  try {
    await mongoose.connect(MONGODB_URI);

    // Find order SO2569-0006
    const order = await InventoryOrder.findOne({ reference: 'SO2569-0006' });
    
    console.log('Order SO2569-0006:');
    console.log(`  ID: ${order._id}`);
    console.log(`  Type: ${order.type}`);
    console.log(`  Status: ${order.status}`);
    console.log(`  OrderDate: ${order.orderDate}`);
    console.log(`  CreatedAt: ${order.createdAt}`);
    console.log(`  Items:`);
    order.items.forEach((item, i) => {
      console.log(`    ${i+1}. ${item.sku} x ${item.quantity}`);
    });

    // Find all SO2569-0006 related orders
    console.log('\n\nAll orders with SO2569-0006 reference:');
    const all = await InventoryOrder.find({ reference: /SO2569-0006/ });
    all.forEach((o, i) => {
      console.log(`${i+1}. ${o.reference} | Type: ${o.type} | Date: ${o.orderDate.toISOString()} | Items: ${o.items.length}`);
      o.items.forEach(item => {
        console.log(`   - ${item.sku} x ${item.quantity}`);
      });
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkOrder();

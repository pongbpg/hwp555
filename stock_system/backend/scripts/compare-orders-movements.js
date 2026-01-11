/**
 * Check InventoryOrders vs StockMovements
 * เพื่อหา orders ที่บันทึกแต่ไม่มี movements
 */

import mongoose from 'mongoose';
import InventoryOrder from '../models/InventoryOrder.js';
import StockMovement from '../models/StockMovement.js';

const MONGODB_URI = 'mongodb://mongo:KTlBvUhGjEidMDEKLAzevAVCOATaiNsU@gondola.proxy.rlwy.net:33948/test?authSource=admin';

async function compareOrdersAndMovements() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const SKU = 'XSR-SW-SKP-B-M';

    console.log(`📋 Comparing InventoryOrders vs StockMovements for SKU: ${SKU}`);
    console.log('═'.repeat(150));

    // Get all orders with this SKU
    const orders = await InventoryOrder.find(
      { 'items.sku': SKU, type: 'sale', status: { $ne: 'cancelled' } },
      { items: 1, type: 1, reference: 1, orderDate: 1, createdAt: 1 }
    ).sort({ orderDate: 1 }).lean();

    console.log(`\n🛒 InventoryOrders (Total: ${orders.length}):`);
    console.log('─'.repeat(150));
    
    let totalFromOrders = 0;
    const ordersByDate = new Map();

    for (const order of orders) {
      const item = order.items.find(i => i.sku === SKU);
      if (item) {
        const orderDate = new Date(order.orderDate).toISOString();
        totalFromOrders += item.quantity;
        
        console.log(`Order ${order.reference} (${orderDate}): ${item.quantity} units`);
        
        if (!ordersByDate.has(orderDate)) {
          ordersByDate.set(orderDate, 0);
        }
        ordersByDate.set(orderDate, ordersByDate.get(orderDate) + item.quantity);
      }
    }

    console.log(`\nTotal from Orders: ${totalFromOrders} units`);

    // Get all movements for this SKU
    const movements = await StockMovement.find(
      { sku: SKU, movementType: 'out' },
      { quantity: 1, createdAt: 1, reference: 1 }
    ).sort({ createdAt: 1 }).lean();

    console.log(`\n📤 StockMovements (Total: ${movements.length}):`);
    console.log('─'.repeat(150));
    
    let totalFromMovements = 0;
    const movementsByDate = new Map();

    for (const m of movements) {
      const date = new Date(m.createdAt).toISOString();
      totalFromMovements += Math.abs(m.quantity);
      
      console.log(`Movement (${date}): ${Math.abs(m.quantity)} units [Ref: ${m.reference || 'N/A'}]`);
      
      if (!movementsByDate.has(date)) {
        movementsByDate.set(date, 0);
      }
      movementsByDate.set(date, movementsByDate.get(date) + Math.abs(m.quantity));
    }

    console.log(`\nTotal from Movements: ${totalFromMovements} units`);

    // Compare by date
    console.log(`\n\n📊 Comparison by Date:`);
    console.log('─'.repeat(150));
    
    const allDates = new Set([...ordersByDate.keys(), ...movementsByDate.keys()]);
    
    for (const date of Array.from(allDates).sort()) {
      const ordersQty = ordersByDate.get(date) || 0;
      const movementsQty = movementsByDate.get(date) || 0;
      const status = ordersQty === movementsQty ? '✅' : '❌';
      
      console.log(`${status} ${date}: Orders=${ordersQty}, Movements=${movementsQty}${ordersQty !== movementsQty ? ` (diff: ${ordersQty - movementsQty})` : ''}`);
    }

    console.log(`\n\n📈 Summary:`);
    console.log('─'.repeat(150));
    console.log(`Total from Orders: ${totalFromOrders} units`);
    console.log(`Total from Movements: ${totalFromMovements} units`);
    console.log(`Difference: ${totalFromOrders - totalFromMovements} units`);
    
    if (totalFromOrders !== totalFromMovements) {
      console.log(`\n⚠️  MISSING MOVEMENTS! ${totalFromOrders - totalFromMovements} units not recorded in StockMovements`);
    } else {
      console.log(`\n✅ All orders have corresponding movements!`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

compareOrdersAndMovements();

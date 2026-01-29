import express from 'express';
import InventoryOrder from '../models/InventoryOrder.js';
import Product from '../models/Product.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * Debug endpoint: ดึงข้อมูล purchase orders สำหรับ variantId ที่ระบุ
 * เพื่อตรวจสอบการคำนวณ receivedQuantity และ purchaseRemaining
 */
router.get('/debug-receipts/:variantId', authenticateToken, async (req, res) => {
  try {
    const { variantId } = req.params;

    // ดึง purchase orders ที่มี variantId นี้ (รวม cancelled)
    const orders = await InventoryOrder.find({
      type: 'purchase',
      'items.variantId': variantId,
    }).lean();
    
    // ดึงเฉพาะ pending + completed สำหรับ purchaseRemaining calculation
    const activeOrders = orders.filter(o => o.status !== 'cancelled');

    const result = {
      variantId,
      totalOrders: orders.length,
      activeOrders: activeOrders.length,
      cancelledOrders: orders.length - activeOrders.length,
      orders: [],
      totals: {
        totalOrdered: 0,
        totalReceived: 0,
        totalRemaining: 0,
      },
      activeTotals: {
        totalOrdered: 0,
        totalReceived: 0,
        totalRemaining: 0,
      },
    };

    // วิเคราะห์แต่ละ order
    for (const order of orders) {
      const orderData = {
        orderId: order._id,
        reference: order.reference,
        status: order.status,
        orderDate: order.orderDate,
        itemsInOrder: [],
      };

      // หาไทม์ index ของ variantId
      for (let idx = 0; idx < order.items.length; idx++) {
        const item = order.items[idx];
        if (String(item.variantId) === String(variantId)) {
          // คำนวณ receivedQuantity จาก receipts
          const receivedQty = (order.receipts || [])
            .filter((r) => r.status === 'completed' && r.itemIndex === idx)
            .reduce((sum, r) => sum + (r.quantity || 0), 0);

          const remaining = item.quantity - receivedQty;

          orderData.itemsInOrder.push({
            itemIndex: idx,
            sku: item.sku,
            ordered: item.quantity,
            received: receivedQty,
            remaining,
            receipts: (order.receipts || [])
              .filter((r) => r.itemIndex === idx)
              .map((r) => ({
                quantity: r.quantity,
                batchRef: r.batchRef,
                status: r.status,
                receivedAt: r.receivedAt,
              })),
          });

          result.totals.totalOrdered += item.quantity;
          result.totals.totalReceived += receivedQty;
          result.totals.totalRemaining += remaining;
          
          // ✅ คำนวณ active totals (pending + completed only)
          if (order.status !== 'cancelled') {
            result.activeTotals.totalOrdered += item.quantity;
            result.activeTotals.totalReceived += receivedQty;
            result.activeTotals.totalRemaining += remaining;
          }
        }
      }

      if (orderData.itemsInOrder.length > 0) {
        result.orders.push(orderData);
      }
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Debug endpoint: เปรียบเทียบ Insights data vs Order data ที่ถูกต้อง
 */
router.get('/debug-insights-vs-actual/:variantId', authenticateToken, async (req, res) => {
  try {
    const { variantId } = req.params;

    // ดึงข้อมูล variant จาก Product
    const products = await Product.find(
      { 'variants._id': variantId },
      { variants: 1, name: 1, leadTimeDays: 1, reorderBufferDays: 1 }
    ).lean();

    const product = products[0];
    const variant = product?.variants.find((v) => String(v._id) === String(variantId));

    // ดึง purchase orders เพื่อคำนวณ actualPurchaseRemaining
    const orders = await InventoryOrder.find({
      type: 'purchase',
      'items.variantId': variantId,
      status: { $in: ['pending', 'completed'] },
    }).lean();

    let actualPurchaseRemaining = 0;
    let actualPurchaseReceived = 0;
    let actualPurchaseOrdered = 0;

    for (const order of orders) {
      for (let idx = 0; idx < order.items.length; idx++) {
        const item = order.items[idx];
        if (String(item.variantId) === String(variantId)) {
          const receivedQty = (order.receipts || [])
            .filter((r) => r.status === 'completed' && r.itemIndex === idx)
            .reduce((sum, r) => sum + (r.quantity || 0), 0);

          actualPurchaseOrdered += item.quantity;
          actualPurchaseReceived += receivedQty;
          actualPurchaseRemaining += item.quantity - receivedQty;
        }
      }
    }

    res.json({
      variantId,
      productName: product?.name,
      variantIncoming: variant?.incoming || 0,
      actual: {
        purchaseOrdered: actualPurchaseOrdered,
        purchaseReceived: actualPurchaseReceived,
        purchaseRemaining: actualPurchaseRemaining,
      },
      incomingVsActual: {
        incoming: variant?.incoming || 0,
        actualRemaining: actualPurchaseRemaining,
        match: (variant?.incoming || 0) === actualPurchaseRemaining ? '✅ ตรงกัน' : '❌ ไม่ตรงกัน',
      },
      notes: {
        incoming: 'จำนวนจาก variant.incoming (ใช้มาจาก PO ที่สั่ง)',
        actualRemaining: 'จำนวนจากการคำนวณ receipts (ยอดค้างรับที่แท้จริง)',
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

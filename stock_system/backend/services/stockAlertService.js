/**
 * Stock Alert Service
 * บริการตรวจสอบและแจ้งเตือนสินค้าที่มีความเสี่ยงจะหมดสต็อก
 * โดยคำนวณจาก:
 * 1. ปริมาณการขายเฉลี่ยต่อวัน (Average Daily Sales)
 * 2. Lead Time ในการสั่งซื้อสินค้า
 * 3. Buffer Days สำหรับความปลอดภัย
 */

import Product from '../models/Product.js';
import InventoryOrder from '../models/InventoryOrder.js';
import { sendStockAlertText, sendStockAlertFlexMessage } from '../utils/lineNotify.js';

const debugStockAlerts =
  process.env.DEBUG_STOCK_ALERTS === '1' ||
  process.env.DEBUG_STOCK_ALERTS === 'true';
const logDebug = (...args) => {
  if (debugStockAlerts) console.log(...args);
};

/**
 * คำนวณยอดขายเฉลี่ยต่อวันของ variant จาก InventoryOrder (ให้ผลสม่ำเสมอทุก endpoint)
 * @param {string} variantId - Variant ID
 * @param {number} days - จำนวนวันย้อนหลังที่ต้องการคำนวณ (default: 30)
 * @returns {Promise<number>} - ยอดขายเฉลี่ยต่อวัน
 */
export const calculateAverageDailySalesFromOrders = async (variantId, days = 30) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const result = await InventoryOrder.aggregate([
    {
      $match: {
        type: 'sale',
        orderDate: { $gte: startDate },
        status: { $ne: 'cancelled' },
      },
    },
    { $unwind: '$items' },
    {
      $match: {
        'items.variantId': variantId,
      },
    },
    {
      $group: {
        _id: null,
        totalSold: { $sum: '$items.quantity' },
      },
    },
  ]);

  const totalSold = result[0]?.totalSold || 0;
  return totalSold / days;
};

/**
 * ตรวจสอบว่า variant มีความเสี่ยงจะหมดสต็อกหรือไม่
 * @param {object} product - Product document
 * @param {object} variant - Variant subdocument
 * @param {number} avgDailySales - ยอดขายเฉลี่ยต่อวัน (ถ้าไม่ระบุจะคำนวณจาก InventoryOrder)
 * @returns {Promise<object|null>} - Alert object หรือ null ถ้าไม่มีความเสี่ยง
 */
export const checkVariantStockRisk = async (product, variant, avgDailySales = null) => {
  // ✅ ตรวจสอบว่าเปิดการแจ้งเตือนอยู่หรือไม่ (variant level > product level)
  const alertEnabled = variant.enableStockAlerts !== undefined ? variant.enableStockAlerts : product.enableStockAlerts;
  if (!alertEnabled) {
    return null;
  }

  const currentStock = variant.stockOnHand || 0;
  
  // ✅ คำนวณ purchaseRemaining จาก purchase orders (status='pending' เท่านั้น)
  // ไม่ใช้ variant.incoming เพราะอาจไม่ตรงกับการคำนวณใน insights/dashboard
  const purchaseOrders = await InventoryOrder.find({ 
    type: 'purchase', 
    status: 'pending',
    'items.variantId': variant._id 
  }).lean();
  
  let purchaseRemaining = 0;
  for (const order of purchaseOrders) {
    for (let itemIndex = 0; itemIndex < order.items.length; itemIndex++) {
      const item = order.items[itemIndex];
      if (String(item.variantId) !== String(variant._id)) continue;
      
      // คำนวณจำนวนที่รับแล้วจาก receipts
      const received = (order.receipts || [])
        .filter((r) => r.status === 'completed' && r.itemIndex === itemIndex)
        .reduce((sum, r) => sum + (r.quantity || 0), 0);
      
      purchaseRemaining += item.quantity - received;
    }
  }
  
  const availableStock = currentStock + purchaseRemaining; // ✅ รวม purchaseRemaining ที่คำนวณจาก receipts
  const reorderPoint = variant.reorderPoint || 0;
  const leadTimeDays = product.leadTimeDays || 7; // Get from product level
  const bufferDays = product.reorderBufferDays ?? 7;

  // คำนวณ average daily sales ถ้าไม่ได้ระบุมา
  // ✅ ใช้ leadTimeDays + bufferDays เพื่อให้คำนวณแม่นยำสำหรับช่วงเวลาที่สินค้าต้องการ
  if (avgDailySales === null) {
    const salesPeriodDays = leadTimeDays + bufferDays;
    avgDailySales = await calculateAverageDailySalesFromOrders(variant._id, salesPeriodDays);
  }

  // ถ้าไม่มียอดขาย ใช้ค่าประมาณจาก reorderPoint / leadTime
  if (avgDailySales === 0 && reorderPoint > 0 && leadTimeDays > 0) {
    avgDailySales = reorderPoint / leadTimeDays;
  }

  // ถ้ายังคำนวณไม่ได้ ให้ใช้ minimum threshold
  if (avgDailySales === 0) {
    avgDailySales = 0.1; // สมมติขายวันละ 0.1 ชิ้น
  }

  const finalAvgDailySales = avgDailySales;

  // ✅ คำนวณจำนวนวันที่สต็อกจะเพียงพอ (ใช้ availableStock รวม incoming)
  const daysOfStock = Math.floor(availableStock / finalAvgDailySales);

  // ใช้ calculateReorderMetrics เพื่อให้ผลลัพธ์สอดคล้องกับ endpoints ทั้งหมด
  const reorderMetrics = calculateReorderMetrics(finalAvgDailySales, leadTimeDays, bufferDays);
  const computedReorderPoint = reorderMetrics.suggestedReorderPoint;
  const safetyStock = reorderMetrics.safetyStock;
  const computedReorderQty = reorderMetrics.suggestedReorderQty;

  logDebug(`🔍 [Stock Risk] Checking ${variant.sku}:`, {
    currentStock,
    purchaseRemaining,
    availableStock,
    avgDailySales: finalAvgDailySales.toFixed(3),
    leadTimeDays,
    bufferDays,
    safetyStock,
    computedReorderPoint,
    computedReorderQty,
    daysOfStock,
  });

  // ✅ ตรวจสอบว่าต้องแจ้งเตือนหรือไม่ (ใช้ availableStock รวม incoming)
  const shouldAlert =
    availableStock <= 0 || // หมดสต็อก (รวม incoming แล้ว)
    availableStock <= reorderPoint || // ถึงจุดสั่งซื้อ
    availableStock <= safetyStock || // ต่ำกว่า safety stock
    daysOfStock <= leadTimeDays; // สต็อกเหลือไม่พอช่วง lead time

  if (!shouldAlert) {
    return null;
  }

  // ✅ คำนวณจำนวนที่แนะนำให้สั่งซื้อ (ใช้ availableStock รวม incoming)
  const suggestedOrder = Math.max(
    0,
    computedReorderQty - availableStock
  );

  // กำหนด stock status (ใช้ availableStock)
  let stockStatus = 'low-stock';
  if (availableStock <= 0) {
    stockStatus = 'out-of-stock';
  } else if (daysOfStock <= 3) {
    stockStatus = 'critical';
  }

  return {
    productId: product._id,
    productName: product.name,
    variantId: variant._id,
    variantName: variant.name,
    sku: variant.sku,
    currentStock,
    incoming: purchaseRemaining, // ✅ ใช้ purchaseRemaining ที่คำนวณจาก receipts
    availableStock, // ✅ รวม purchaseRemaining
    // ให้ field `reorderPoint` ยังคงเก็บค่าที่ user กำหนดใน variant (ถ้ามี)
    reorderPoint,
    // ส่งค่าที่คำนวณแนะนำด้วยเพื่อให้ client/notifications แสดงค่าเดียวกับการคำนวณ
    suggestedReorderPoint: Math.ceil(computedReorderPoint),
    leadTimeDays,
    avgDailySales: finalAvgDailySales,
    daysOfStock,
    safetyStock: Math.ceil(safetyStock),
    computedReorderQty: Math.ceil(computedReorderQty),
    suggestedOrder: Math.ceil(suggestedOrder),
    stockStatus,
    category: product.category,
    brand: product.brand,
  };
};

/**
 * ตรวจสอบและแจ้งเตือนสินค้าที่มีความเสี่ยงหลังจากการขาย
 * @param {Array} soldItems - รายการสินค้าที่ขาย [{productId, variantId, quantity}]
 * @param {object} options - ตัวเลือกเพิ่มเติม
 * @returns {Promise<object>} - ผลลัพธ์การแจ้งเตือน
 */
export const checkAndAlertAfterSale = async (soldItems, options = {}) => {
  const { sendNotification = true, notificationType = 'auto' } = options;
  const alerts = [];

  for (const item of soldItems) {
    try {
      const product = await Product.findById(item.productId);
      if (!product) continue;

      const variant = product.variants.id(item.variantId);
      if (!variant) continue;

      // ✅ ใช้ leadTimeDays + bufferDays เพื่อให้การแจ้งเตือนแม่นยำกับช่วงเวลาสินค้า
      const leadTimeDays = product.leadTimeDays || 7;
      const bufferDays = product.reorderBufferDays ?? 7;
      const salesPeriodDays = leadTimeDays + bufferDays;
      const avgDailySales = await calculateAverageDailySalesFromOrders(variant._id, salesPeriodDays);

      logDebug(`📊 [LINE Alert] Calculating for ${variant.sku}:`, {
        variantId: variant._id,
        currentStock: variant.stockOnHand,
        avgDailySales: avgDailySales.toFixed(3),
      });

      // ตรวจสอบความเสี่ยง
      const alert = await checkVariantStockRisk(product, variant, avgDailySales);
      if (alert) {
        logDebug(`🔔 [LINE Alert] Alert created for ${variant.sku}:`, {
          suggestedReorderPoint: alert.suggestedReorderPoint,
          suggestedOrder: alert.suggestedOrder,
          avgDailySales: alert.avgDailySales.toFixed(3),
          daysOfStock: alert.daysOfStock,
          currentStock: alert.currentStock,
        });
        alerts.push(alert);
      }
    } catch (error) {
      console.error(`Error checking stock risk for variant ${item.variantId}:`, error);
    }
  }

  // ส่งการแจ้งเตือนถ้ามี
  let notificationResult = null;
  if (sendNotification && alerts.length > 0) {
    logDebug(`📤 [LINE Alert] Sending ${alerts.length} alerts to LINE:`, alerts.map((a) => ({
      sku: a.sku,
      currentStock: a.currentStock,
      suggestedReorderPoint: a.suggestedReorderPoint,
      suggestedOrder: a.suggestedOrder,
      avgDailySales: a.avgDailySales.toFixed(3),
    })));
    
    try {
      // เลือกวิธีการแจ้งเตือน
      const useFlexMessage =
        notificationType === 'flex' ||
        (notificationType === 'auto' && process.env.LINE_CHANNEL_ACCESS_TOKEN);

      if (useFlexMessage) {
        notificationResult = await sendStockAlertFlexMessage(alerts);
      } else {
        notificationResult = await sendStockAlertText(alerts);
      }
    } catch (error) {
      console.error('Error sending stock alert notification:', error);
      notificationResult = { success: false, error: error.message };
    }
  }

  return {
    alertCount: alerts.length,
    alerts,
    notificationSent: sendNotification && alerts.length > 0,
    notificationResult,
  };
};

/**
 * ตรวจสอบสินค้าทั้งหมดที่มีความเสี่ยง (สำหรับ scheduled job)
 * Groups variants by product and applies MOQ optimization
 * @param {object} options - ตัวเลือก
 * @returns {Promise<object>}
 */
export const checkAllStockRisks = async (options = {}) => {
  const { sendNotification = true, category = null, brand = null } = options;
  const alerts = [];

  // สร้าง query filter
  const query = { status: 'active' };
  if (category) query.category = category;
  if (brand) query.brand = brand;

  const products = await Product.find(query);

  // Group variants by product and apply MOQ optimization
  for (const product of products) {
    const productAlerts = [];

    // Collect alerts for all active variants in this product
    for (const variant of product.variants || []) {
      if (variant.status !== 'active') continue;

      const alert = await checkVariantStockRisk(product, variant);
      if (alert) {
        productAlerts.push(alert);
      }
    }

    // Apply MOQ optimization if there are alerts
    if (productAlerts.length > 0) {
      const optimizedAlerts = optimizeOrderWithMOQ(product, productAlerts);
      alerts.push(...optimizedAlerts);
    }
  }

  // เรียงตามความเร่งด่วน
  alerts.sort((a, b) => {
    // เรียงตาม stock status (out-of-stock > critical > low-stock)
    const statusOrder = { 'out-of-stock': 0, critical: 1, 'low-stock': 2 };
    const statusDiff = (statusOrder[a.stockStatus] || 3) - (statusOrder[b.stockStatus] || 3);
    if (statusDiff !== 0) return statusDiff;

    // เรียงตาม days of stock
    return a.daysOfStock - b.daysOfStock;
  });

  // ส่งการแจ้งเตือนถ้ามี
  let notificationResult = null;
  if (sendNotification && alerts.length > 0) {
    try {
      notificationResult = await sendStockAlertText(alerts);
    } catch (error) {
      console.error('Error sending stock alert notification:', error);
      notificationResult = { success: false, error: error.message };
    }
  }

  return {
    alertCount: alerts.length,
    alerts,
    notificationSent: sendNotification && alerts.length > 0,
    notificationResult,
  };
};


/**
 * Helper function: คำนวณ Reorder Point เมื่อมี dailySalesRate มาแล้ว (ไม่ต้อง query DB)
 * ใช้สำหรับ endpoints ที่มี dailySalesRate มาแล้ว เพื่อให้คำนวณแบบเดียวกันทุกที่
 * @param {number} dailySalesRate - ยอดขายเฉลี่ยต่อวัน
 * @param {number} leadTimeDays - Lead time ในการสั่งซื้อ (default: 7)
 * @param {number} bufferDays - Buffer days (default: 7)
 * @returns {object} - { safetyStock, suggestedReorderPoint, suggestedReorderQty }
 */
export const calculateReorderMetrics = (dailySalesRate, leadTimeDays = 7, bufferDays = 7) => {
  const safetyStock = Math.ceil(dailySalesRate * bufferDays);
  const suggestedReorderPoint = Math.ceil(dailySalesRate * leadTimeDays + safetyStock);
  const suggestedReorderQty = Math.ceil(dailySalesRate * (leadTimeDays + bufferDays));

  return {
    safetyStock,
    suggestedReorderPoint,
    suggestedReorderQty,
    leadTimeDays,
    bufferDays,
  };
};

/**
 * Optimize order quantities based on Minimum Order Quantity (MOQ)
 * If the total suggestedOrder across all variants is less than product.minOrderQty,
 * distribute the deficit proportionally based on avgDailySales.
 * @param {object} product - Product document
 * @param {Array} variantAlerts - Array of alert objects from checkVariantStockRisk
 * @returns {Array} - Updated alert objects with optimized suggestedOrder
 */
export const optimizeOrderWithMOQ = (product, variantAlerts) => {
  const minOrderQty = product.minOrderQty || 0;

  // If no MOQ set, return alerts as-is
  if (minOrderQty === 0) {
    return variantAlerts;
  }

  // Calculate total suggested order and total avgDailySales
  const totalSuggestedOrder = variantAlerts.reduce((sum, alert) => sum + alert.suggestedOrder, 0);
  const totalAvgDailySales = variantAlerts.reduce((sum, alert) => sum + alert.avgDailySales, 0);

  // If total suggested order already meets or exceeds MOQ, no optimization needed
  if (totalSuggestedOrder >= minOrderQty) {
    return variantAlerts;
  }

  // Calculate deficit to distribute
  const deficit = minOrderQty - totalSuggestedOrder;

  logDebug(`📦 [MOQ Optimization] Product: ${product.name}`, {
    minOrderQty,
    totalSuggestedOrder,
    deficit,
    totalAvgDailySales: totalAvgDailySales.toFixed(3),
    variantCount: variantAlerts.length,
  });

  // Distribute deficit proportionally based on avgDailySales
  if (totalAvgDailySales === 0) {
    // If no sales data, distribute equally
    const deficitPerVariant = Math.ceil(deficit / variantAlerts.length);
    return variantAlerts.map((alert) => ({
      ...alert,
      suggestedOrder: alert.suggestedOrder + deficitPerVariant,
      computedReorderQty: alert.computedReorderQty + deficitPerVariant,
      moqAdjustment: deficitPerVariant,
    }));
  }

  // Distribute proportionally based on sales velocity
  let remainingDeficit = deficit;
  const optimizedAlerts = variantAlerts.map((alert, index, arr) => {
    const salesProportion = alert.avgDailySales / totalAvgDailySales;
    let allocationForThisVariant = Math.ceil(deficit * salesProportion);

    // For the last variant, allocate remaining deficit to avoid rounding errors
    if (index === arr.length - 1) {
      allocationForThisVariant = Math.max(0, remainingDeficit);
    } else {
      remainingDeficit -= allocationForThisVariant;
    }

    logDebug(`  - ${alert.sku}: allocation=${allocationForThisVariant}, avgDailySales=${alert.avgDailySales.toFixed(3)}, proportion=${(salesProportion * 100).toFixed(1)}%`);

    return {
      ...alert,
      suggestedOrder: alert.suggestedOrder + allocationForThisVariant,
      computedReorderQty: alert.computedReorderQty + allocationForThisVariant,
      moqAdjustment: allocationForThisVariant,
    };
  });

  return optimizedAlerts;
};

export default {
  calculateAverageDailySalesFromOrders,
  checkVariantStockRisk,
  checkAndAlertAfterSale,
  checkAllStockRisks,
  calculateReorderMetrics,
  optimizeOrderWithMOQ,
};

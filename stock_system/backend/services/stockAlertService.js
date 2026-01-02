/**
 * Stock Alert Service
 * บริการตรวจสอบและแจ้งเตือนสินค้าที่มีความเสี่ยงจะหมดสต็อก
 * โดยคำนวณจาก:
 * 1. ปริมาณการขายเฉลี่ยต่อวัน (Average Daily Sales)
 * 2. Lead Time ในการสั่งซื้อสินค้า
 * 3. Buffer Days สำหรับความปลอดภัย
 */

import StockMovement from '../models/StockMovement.js';
import Product from '../models/Product.js';
import { sendStockAlertText, sendStockAlertFlexMessage } from '../utils/lineNotify.js';

/**
 * คำนวณยอดขายเฉลี่ยต่อวันของ variant จาก InventoryOrder (ให้ผลสม่ำเสมอทุก endpoint)
 * @param {string} variantId - Variant ID
 * @param {number} days - จำนวนวันย้อนหลังที่ต้องการคำนวณ (default: 30)
 * @returns {Promise<number>} - ยอดขายเฉลี่ยต่อวัน
 */
export const calculateAverageDailySalesFromOrders = async (variantId, days = 30) => {
  const InventoryOrder = (await import('../models/InventoryOrder.js')).default;
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
 * คำนวณยอดขายเฉลี่ยต่อวันของ variant (ใช้ StockMovement - อาจต่างจาก InventoryOrder)
 * @param {string} variantId - Variant ID
 * @param {number} days - จำนวนวันย้อนหลังที่ต้องการคำนวณ (default: 30)
 * @returns {Promise<number>} - ยอดขายเฉลี่ยต่อวัน
 */
export const calculateAverageDailySales = async (variantId, days = 30) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const result = await StockMovement.aggregate([
    {
      $match: {
        variantId: variantId,
        movementType: 'out',
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: null,
        totalSold: { $sum: { $abs: '$quantity' } },
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
 * @param {number} avgDailySales - ยอดขายเฉลี่ยต่อวัน (ถ้าไม่ระบุจะคำนวณจาก StockMovement - ไม่แนะนำ)
 * @returns {Promise<object|null>} - Alert object หรือ null ถ้าไม่มีความเสี่ยง
 * @deprecated ใช้ checkVariantStockRiskWithSalesRate แทน เพื่อให้ผลลัพธ์สอดคล้องกับ endpoints
 */
export const checkVariantStockRisk = async (product, variant, avgDailySales = null) => {
  const currentStock = variant.stockOnHand || 0;
  const reorderPoint = variant.reorderPoint || 0;
  const leadTimeDays = variant.leadTimeDays || 7; // default 7 days
  const bufferDays = product.reorderBufferDays || 7; // default 7 days (consistent with inventory.js)

  // คำนวณ average daily sales ถ้าไม่ได้ระบุมา
  if (avgDailySales === null) {
    avgDailySales = await calculateAverageDailySalesFromOrders(variant._id, 30);
  }

  // ถ้าไม่มียอดขาย ใช้ค่าประมาณจาก reorderPoint / leadTime
  if (avgDailySales === 0 && reorderPoint > 0 && leadTimeDays > 0) {
    avgDailySales = reorderPoint / leadTimeDays;
  }

  // ถ้ายังคำนวณไม่ได้ ให้ใช้ minimum threshold
  if (avgDailySales === 0) {
    avgDailySales = 0.1; // สมมติขายวันละ 0.1 ชิ้น
  }

  // ใช้ checkVariantStockRiskWithSalesRate เพื่อให้ผลลัพธ์สอดคล้องกัน
  return checkVariantStockRiskWithSalesRate(product, variant, avgDailySales);
};

/**
 * ตรวจสอบความเสี่ยงสต็อก เมื่อมี avgDailySales มาแล้ว (ให้ผลลัพธ์สม่ำเสมอทุก endpoint)
 * @param {object} product - Product document
 * @param {object} variant - Variant subdocument
 * @param {number} avgDailySales - ยอดขายเฉลี่ยต่อวัน (ต้องมีค่า)
 * @returns {object|null} - Alert object หรือ null ถ้าไม่มีความเสี่ยง
 */
export const checkVariantStockRiskWithSalesRate = (product, variant, avgDailySales) => {
  const currentStock = variant.stockOnHand || 0;
  const reorderPoint = variant.reorderPoint || 0;
  const leadTimeDays = variant.leadTimeDays || 7;
  const bufferDays = product.reorderBufferDays || 7;

  // ถ้ายังคำนวณไม่ได้ ให้ใช้ minimum threshold
  let finalAvgDailySales = avgDailySales;
  if (avgDailySales === 0) {
    if (reorderPoint > 0 && leadTimeDays > 0) {
      finalAvgDailySales = reorderPoint / leadTimeDays;
    } else {
      finalAvgDailySales = 0.1;
    }
  }

  // คำนวณจำนวนวันที่สต็อกจะเพียงพอ
  const daysOfStock = Math.floor(currentStock / finalAvgDailySales);

  // ใช้ calculateReorderMetrics เพื่อให้ผลลัพธ์สอดคล้องกับ endpoints ทั้งหมด
  const reorderMetrics = calculateReorderMetrics(finalAvgDailySales, leadTimeDays, bufferDays);
  const computedReorderPoint = reorderMetrics.suggestedReorderPoint;
  const safetyStock = reorderMetrics.safetyStock;
  const computedReorderQty = reorderMetrics.suggestedReorderQty;

  console.log(`🔍 [Stock Risk] Checking ${variant.sku}:`, {
    currentStock,
    avgDailySales: finalAvgDailySales.toFixed(3),
    leadTimeDays,
    bufferDays,
    safetyStock,
    computedReorderPoint,
    computedReorderQty,
    daysOfStock,
  });

  // ตรวจสอบว่าต้องแจ้งเตือนหรือไม่
  const shouldAlert =
    currentStock <= 0 || // หมดสต็อก
    currentStock <= reorderPoint || // ถึงจุดสั่งซื้อ
    currentStock <= safetyStock || // ต่ำกว่า safety stock
    daysOfStock <= leadTimeDays; // สต็อกเหลือไม่พอช่วง lead time

  if (!shouldAlert) {
    return null;
  }

  // คำนวณจำนวนที่แนะนำให้สั่งซื้อ (เพื่อให้ถึงจุด reorder point)
  const suggestedOrder = Math.max(
    0,
    computedReorderQty - currentStock
  );

  // กำหนด stock status
  let stockStatus = 'low-stock';
  if (currentStock <= 0) {
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

      // ใช้ calculateAverageDailySalesFromOrders เพื่อให้ผลลัพธ์ตรงกับ /alerts และ /insights
      const avgDailySales = await calculateAverageDailySalesFromOrders(variant._id, 30);

      console.log(`📊 [LINE Alert] Calculating for ${variant.sku}:`, {
        variantId: variant._id,
        currentStock: variant.stockOnHand,
        leadTimeDays: variant.leadTimeDays || 7,
        avgDailySales: avgDailySales.toFixed(3),
      });

      // ตรวจสอบความเสี่ยง
      const alert = await checkVariantStockRisk(product, variant, avgDailySales);
      if (alert) {
        console.log(`🔔 [LINE Alert] Alert created for ${variant.sku}:`, {
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
    console.log(`📤 [LINE Alert] Sending ${alerts.length} alerts to LINE:`, alerts.map(a => ({
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

  for (const product of products) {
    for (const variant of product.variants || []) {
      if (variant.status !== 'active') continue;

      const alert = await checkVariantStockRisk(product, variant);
      if (alert) {
        alerts.push(alert);
      }
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
 * คำนวณ Reorder Point ที่แนะนำ
 * @param {string} variantId - Variant ID
 * @param {number} leadTimeDays - Lead time ในการสั่งซื้อ (default: 7 วัน)
 * @param {number} bufferDays - Buffer days สำหรับความปลอดภัย (default: 7 วัน)
 * @returns {Promise<object>}
 */
export const calculateSuggestedReorderPoint = async (variantId, leadTimeDays = 7, bufferDays = 7) => {
  const avgDailySales = await calculateAverageDailySales(variantId, 30);

  // Reorder Point = (Average Daily Sales × Lead Time) + Safety Stock
  // Safety Stock = Average Daily Sales × Buffer Days
  const safetyStock = Math.ceil(avgDailySales * bufferDays);
  const reorderPoint = Math.ceil(avgDailySales * leadTimeDays + safetyStock);

  // Reorder Quantity = Average Daily Sales × (Lead Time + Buffer)
  const reorderQty = Math.ceil(avgDailySales * (leadTimeDays + bufferDays));

  return {
    avgDailySales,
    safetyStock,
    suggestedReorderPoint: reorderPoint,
    suggestedReorderQty: reorderQty,
    leadTimeDays,
    bufferDays,
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

export default {
  calculateAverageDailySales,
  calculateAverageDailySalesFromOrders,
  checkVariantStockRisk,
  checkVariantStockRiskWithSalesRate,
  checkAndAlertAfterSale,
  checkAllStockRisks,
  calculateSuggestedReorderPoint,
  calculateReorderMetrics,
};

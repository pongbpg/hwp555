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
 * คำนวณยอดขายเฉลี่ยต่อวันของ variant
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
 * @param {number} avgDailySales - ยอดขายเฉลี่ยต่อวัน (ถ้าไม่ระบุจะคำนวณใหม่)
 * @returns {Promise<object|null>} - Alert object หรือ null ถ้าไม่มีความเสี่ยง
 */
export const checkVariantStockRisk = async (product, variant, avgDailySales = null) => {
  const currentStock = variant.stockOnHand || 0;
  const reorderPoint = variant.reorderPoint || 0;
  const leadTimeDays = variant.leadTimeDays || 7; // default 7 days
  const reorderQty = variant.reorderQty || 0;
  const bufferDays = product.reorderBufferDays || 14;

  // คำนวณ average daily sales ถ้าไม่ได้ระบุมา
  if (avgDailySales === null) {
    avgDailySales = await calculateAverageDailySales(variant._id, 30);
  }

  // ถ้าไม่มียอดขาย ใช้ค่าประมาณจาก reorderPoint / leadTime
  if (avgDailySales === 0 && reorderPoint > 0 && leadTimeDays > 0) {
    avgDailySales = reorderPoint / leadTimeDays;
  }

  // ถ้ายังคำนวณไม่ได้ ให้ใช้ minimum threshold
  if (avgDailySales === 0) {
    avgDailySales = 0.1; // สมมติขายวันละ 0.1 ชิ้น
  }

  // คำนวณจำนวนวันที่สต็อกจะเพียงพอ
  const daysOfStock = Math.floor(currentStock / avgDailySales);

  // คำนวณ Safety Stock = ยอดขายระหว่าง buffer days (ตามสูตรใน calculateSuggestedReorderPoint)
  const safetyStock = Math.ceil(avgDailySales * bufferDays);

  // คำนวณ Reorder Point ที่แนะนำ (เพื่อให้ตรงกับ calculateSuggestedReorderPoint)
  const computedReorderPoint = Math.ceil(avgDailySales * leadTimeDays + safetyStock);
  // คำนวณ Reorder Quantity ที่แนะนำ
  const computedReorderQty = Math.ceil(avgDailySales * (leadTimeDays + bufferDays));

  // ตรวจสอบว่าต้องแจ้งเตือนหรือไม่
  const shouldAlert =
    currentStock <= 0 || // หมดสต็อก
    currentStock <= reorderPoint || // ถึงจุดสั่งซื้อ
    currentStock <= safetyStock || // ต่ำกว่า safety stock
    daysOfStock <= leadTimeDays; // สต็อกเหลือไม่พอช่วง lead time

  if (!shouldAlert) {
    return null;
  }

  // คำนวณจำนวนที่แนะนำให้สั่งซื้อ
  // เลือกใช้ค่าที่ตั้งไว้ใน variant.reorderQty เป็นขั้นต่ำ แต่ยังคงคำนวณค่าแนะนำจากยอดขายเฉลี่ย
  const suggestedOrder = Math.max(
    reorderQty,
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
    suggestedReorderPoint: computedReorderPoint,
    leadTimeDays,
    avgDailySales,
    daysOfStock,
    safetyStock,
    computedReorderQty,
    suggestedOrder: Math.max(0, suggestedOrder),
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

      // คำนวณ average daily sales รวมการขายครั้งนี้
      const avgDailySales = await calculateAverageDailySales(variant._id, 30);

      // ตรวจสอบความเสี่ยง
      const alert = await checkVariantStockRisk(product, variant, avgDailySales);
      if (alert) {
        alerts.push(alert);
      }
    } catch (error) {
      console.error(`Error checking stock risk for variant ${item.variantId}:`, error);
    }
  }

  // ส่งการแจ้งเตือนถ้ามี
  let notificationResult = null;
  if (sendNotification && alerts.length > 0) {
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
 * @param {number} leadTimeDays - Lead time ในการสั่งซื้อ
 * @param {number} bufferDays - Buffer days สำหรับความปลอดภัย
 * @returns {Promise<object>}
 */
export const calculateSuggestedReorderPoint = async (variantId, leadTimeDays = 7, bufferDays = 14) => {
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

export default {
  calculateAverageDailySales,
  checkVariantStockRisk,
  checkAndAlertAfterSale,
  checkAllStockRisks,
  calculateSuggestedReorderPoint,
};

/**
 * Costing Service
 * รองรับการคำนวณต้นทุนสินค้าคงเหลือตาม costing methods ต่างๆ
 * - FIFO: First In, First Out
 * - LIFO: Last In, First Out
 * - WAC: Weighted Average Cost
 */

/**
 * คำนวณมูลค่าสินค้าคงเหลือตามวิธี costing ที่เลือก
 * ✅ IMPORTANT: คำนวณจาก batches ทั้งหมด ไม่สนใจ variant.cost
 * @param {object} variant - Variant with batches
 * @param {string} costingMethod - 'FIFO' | 'LIFO' | 'WAC' (default: 'FIFO')
 * @returns {number} - มูลค่ารวมสินค้าคงเหลือ
 */
export const calculateInventoryValue = (variant, costingMethod = 'FIFO') => {
  const stockOnHand = variant.stockOnHand || 0;

  // ถ้าไม่มีสต็อกเลย
  if (stockOnHand <= 0) return 0;

  // ถ้าไม่มี batch: ไม่อาจคำนวณ ต้องมีข้อมูล batch
  if (!variant.batches || variant.batches.length === 0) {
    console.warn(`⚠️ calculateInventoryValue: Variant ${variant.sku} has stock (${stockOnHand}) but no batches. Cannot calculate value.`);
    return 0;
  }

  // ✅ Sanitize costingMethod - handle undefined/null/invalid values
  const sanitizedMethod = (costingMethod || 'FIFO').toString().toUpperCase();
  const validMethods = ['FIFO', 'LIFO', 'WAC'];
  const method = validMethods.includes(sanitizedMethod) ? sanitizedMethod : 'FIFO';

  // ✅ คำนวณจาก batches เท่านั้น
  switch (method) {
    case 'LIFO':
      return calculateLIFO(variant.batches, stockOnHand);
    case 'WAC':
      return calculateWAC(variant.batches, stockOnHand);
    case 'FIFO':
    default:
      return calculateFIFO(variant.batches, stockOnHand);
  }
};

/**
 * FIFO: First In, First Out
 * สินค้าที่เข้ามาก่อน ถือว่าออกไปก่อน
 * 
 * Logic: 
 * - ถ้ามี Batch1(1000@1000) + Batch2(1000@500) = 2000 units
 * - stockOnHand = 2000 (ยังไม่ขาย) → ค่า = 1000×1000 + 1000×500 = 1,500,000
 * - ถ้าขาย 1000 units ด้วย FIFO → ขาย Batch1 ก่อน → เหลือ Batch2 = 1000×500 = 500,000
 * 
 * สำหรับ calculateInventoryValue: ใช้ latest batch prices (ใหม่สุด)
 */
const calculateFIFO = (batches, stockOnHand = 0) => {
  if (stockOnHand <= 0) return 0;
  if (!batches || batches.length === 0) {
    return 0;
  }

  // เรียง ascending ตาม receivedAt (เก่าสุดมาก่อน)
  const sorted = batches.sort((a, b) => {
    const aDate = a.receivedAt ? new Date(a.receivedAt) : new Date(0);
    const bDate = b.receivedAt ? new Date(b.receivedAt) : new Date(0);
    return aDate - bDate;
  });

  // ✅ FIFO: สินค้าเก่า (ที่อยู่หน้า sorted array) ถือว่าขายไปก่อน
  // เหลือสต็อก = batch ใหม่สุด
  // Loop จากใหม่สุด (ท้าย array) ไปเก่า เพื่อหาค่าเหลือ
  let totalValue = 0;
  let remainingStock = stockOnHand;

  for (let i = sorted.length - 1; i >= 0 && remainingStock > 0; i--) {
    const batch = sorted[i];
    const batchQty = batch.quantity || 0;
    const batchCost = batch.cost || 0;

    // ใช้จาก batch นี้เท่าที่เหลือต้องการ
    const usedFromBatch = Math.min(batchQty, remainingStock);
    totalValue += usedFromBatch * batchCost;
    remainingStock -= usedFromBatch;
  }

  return totalValue;
};

/**
 * LIFO: Last In, First Out
 * สินค้าที่เข้ามาล่าสุด ถือว่าออกไปก่อน
 * 
 * ตัวอย่าง:
 * Batch 1: 1000 units @ 1000 THB (receivedAt: day1)
 * Batch 2: 1000 units @ 500 THB (receivedAt: day2)
 * ขาย 1000 units
 * 
 * LIFO: ขาย Batch 2 หมดก่อน → เหลือ Batch 1 = 1000 × 1000 = 1,000,000
 */
const calculateLIFO = (batches, stockOnHand = 0) => {
  if (batches.length === 0 || stockOnHand <= 0) return 0;

  // เรียง descending ตาม receivedAt (ล่าสุดมาก่อน)
  const sorted = batches.sort((a, b) => {
    const aDate = a.receivedAt ? new Date(a.receivedAt) : new Date(0);
    const bDate = b.receivedAt ? new Date(b.receivedAt) : new Date(0);
    return bDate - aDate;
  });

  // ✅ LIFO: สินค้าใหม่ (ที่อยู่หน้า sorted array) ถือว่าขายไปก่อน
  // เหลือสต็อก = batch เก่าสุด
  // Loop จากใหม่สุด (หน้า array) ไปเก่า เพื่อหาค่าเหลือ
  let totalValue = 0;
  let remainingStock = stockOnHand;

  // Loop จากใหม่สุด (หน้า array) ไปเก่า
  for (let i = 0; i < sorted.length && remainingStock > 0; i++) {
    const batch = sorted[i];
    const batchQty = batch.quantity || 0;
    const batchCost = batch.cost || 0;

    // ใช้จาก batch นี้เท่าที่เหลือต้องการ
    const usedFromBatch = Math.min(batchQty, remainingStock);
    totalValue += usedFromBatch * batchCost;
    remainingStock -= usedFromBatch;
  }

  return totalValue;
};

/**
 * WAC: Weighted Average Cost
 * ใช้ราคา average ของทั้งหมด
 * ต้นทุนต่อหน่วย = (รวมต้นทุนทั้งหมด) / (รวมจำนวนทั้งหมด)
 */
const calculateWAC = (batches, stockOnHand = 0) => {
  if (batches.length === 0 || stockOnHand <= 0) return 0;

  let totalCost = 0;
  let totalBatchQty = 0;

  batches.forEach((batch) => {
    const qty = batch.quantity || 0;
    const cost = batch.cost || 0;
    totalCost += qty * cost;
    totalBatchQty += qty;
  });

  // Weighted average cost per unit
  const averageCost = totalBatchQty > 0 ? totalCost / totalBatchQty : 0;
  
  // ค่าสต็อกที่เหลือ = stockOnHand × average cost
  return stockOnHand * averageCost;
};

/**
 * หา batches ที่จะใช้ consume ตามลำดับของ costing method
 * @param {Array} batches - Array of batches
 * @param {string} costingMethod - 'FIFO' | 'LIFO' | 'WAC'
 * @returns {Array} - sorted batches
 */
export const getBatchConsumptionOrder = (batches, costingMethod = 'FIFO') => {
  if (!batches || batches.length === 0) return [];

  const batchesCopy = [...batches];

  if (costingMethod === 'LIFO') {
    // LIFO: ใหม่สุดมาก่อน (reverse order of receivedAt)
    return batchesCopy.sort((a, b) => {
      const aDate = a.receivedAt ? new Date(a.receivedAt) : new Date(0);
      const bDate = b.receivedAt ? new Date(b.receivedAt) : new Date(0);
      return bDate - aDate;
    });
  } else if (costingMethod === 'WAC') {
    // WAC: ไม่ต้องจัดเรียง (treat as pool)
    return batchesCopy;
  } else {
    // FIFO: เก่าสุดมาก่อน (default)
    return batchesCopy.sort((a, b) => {
      const aDate = a.receivedAt ? new Date(a.receivedAt) : new Date(0);
      const bDate = b.receivedAt ? new Date(b.receivedAt) : new Date(0);
      return aDate - bDate;
    });
  }
};

/**
 * Consume batches ตามลำดับที่กำหนด + บันทึกประวัติการบริหจัดการ
 * @param {object} variant - Variant document
 * @param {Array} sortedBatches - Batches ที่จัดเรียงแล้ว
 * @param {number} quantity - จำนวนที่ต้องหัก
 * @param {string} costingMethod - costing method (สำหรับ WAC special handling)
 * @param {object} metadata - ข้อมูลเพิ่มเติม { orderId, orderReference }
 * @returns {number} - unconsumed quantity
 */
export const consumeBatchesByOrder = (variant, sortedBatches, quantity, costingMethod = 'FIFO', metadata = {}) => {
  let remaining = quantity;
  const updated = [];

  for (const batch of sortedBatches) {
    if (remaining <= 0) {
      updated.push(batch);
      continue;
    }

    const available = batch.quantity || 0;
    const consumed = Math.min(available, remaining);
    
    if (available <= remaining) {
      // Batch ถูกใช้หมด - เก็บประวัติ (quantity = 0 แต่เก็บไว้เพื่ออ่านประวัติ)
      remaining -= available;
      
      // ✅ บันทึกประวัติการบริหจัดการ batch
      if (batch.consumptionOrder === undefined) {
        batch.consumptionOrder = [];
      }
      batch.consumptionOrder.push({
        orderId: metadata.orderId,
        orderReference: metadata.orderReference,
        quantityConsumedThisTime: consumed,
        consumedAt: new Date()
      });
      
      batch.quantityConsumed = (batch.quantityConsumed || 0) + consumed;
      batch.lastConsumedAt = new Date();
      batch.quantity = 0;  // ← Set to 0 instead of deleting
      
      // ✅ เก็บ batch แม้ว่า quantity = 0 (เพื่ออ่านประวัติได้)
      updated.push(batch);
    } else {
      // Batch เหลือบางส่วน
      const newQty = available - remaining;
      const plainBatch = batch.toObject ? batch.toObject() : batch;
      
      // ✅ บันทึกประวัติ
      if (plainBatch.consumptionOrder === undefined) {
        plainBatch.consumptionOrder = [];
      }
      plainBatch.consumptionOrder.push({
        orderId: metadata.orderId,
        orderReference: metadata.orderReference,
        quantityConsumedThisTime: consumed,
        consumedAt: new Date()
      });
      
      plainBatch.quantityConsumed = (plainBatch.quantityConsumed || 0) + consumed;
      plainBatch.lastConsumedAt = new Date();
      plainBatch.quantity = newQty;
      
      updated.push(plainBatch);
      remaining = 0;
    }
  }

  variant.batches = updated.filter((b) => (b.quantity || 0) > 0);
  return remaining;
};

export default {
  calculateInventoryValue,
  calculateFIFO,
  calculateLIFO,
  calculateWAC,
  getBatchConsumptionOrder,
  consumeBatchesByOrder,
};

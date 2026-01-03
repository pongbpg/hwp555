/**
 * Costing Service
 * รองรับการคำนวณต้นทุนสินค้าคงเหลือตาม costing methods ต่างๆ
 * - FIFO: First In, First Out
 * - LIFO: Last In, First Out
 * - WAC: Weighted Average Cost
 */

/**
 * คำนวณมูลค่าสินค้าคงเหลือตามวิธี costing ที่เลือก
 * @param {object} variant - Variant with batches
 * @param {string} costingMethod - 'FIFO' | 'LIFO' | 'WAC'
 * @returns {number} - มูลค่ารวมสินค้าคงเหลือ
 */
export const calculateInventoryValue = (variant, costingMethod = 'FIFO') => {
  if (!variant.batches || variant.batches.length === 0) {
    // ไม่มี batch: ใช้ stockOnHand × variant.cost
    return (variant.stockOnHand || 0) * (variant.cost || 0);
  }

  const batches = [...(variant.batches || [])];

  switch (costingMethod) {
    case 'LIFO':
      return calculateLIFO(batches);
    case 'WAC':
      return calculateWAC(batches);
    case 'FIFO':
    default:
      return calculateFIFO(batches);
  }
};

/**
 * FIFO: First In, First Out
 * สินค้าที่เข้ามาก่อน ถือว่าออกไปก่อน
 * ค่าสต็อกปลายงวด = ราคาล่าสุดที่ซื้อเข้า
 */
const calculateFIFO = (batches) => {
  if (batches.length === 0) return 0;

  // เรียง ascending ตาม receivedAt (เก่าสุดมาก่อน)
  const sorted = batches.sort((a, b) => {
    const aDate = a.receivedAt ? new Date(a.receivedAt) : new Date(0);
    const bDate = b.receivedAt ? new Date(b.receivedAt) : new Date(0);
    return aDate - bDate;
  });

  // สินค้าคงเหลือจะมาจาก batch ที่เข้ามาล่าสุด
  let totalValue = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const batch = sorted[i];
    const qty = batch.quantity || 0;
    const cost = batch.cost || 0;
    totalValue += qty * cost;
  }
  return totalValue;
};

/**
 * LIFO: Last In, First Out
 * สินค้าที่เข้ามาล่าสุด ถือว่าออกไปก่อน
 * ค่าสต็อกปลายงวด = ราคาเก่าที่สุดที่ซื้อเข้า
 */
const calculateLIFO = (batches) => {
  if (batches.length === 0) return 0;

  // เรียง descending ตาม receivedAt (ล่าสุดมาก่อน)
  const sorted = batches.sort((a, b) => {
    const aDate = a.receivedAt ? new Date(a.receivedAt) : new Date(0);
    const bDate = b.receivedAt ? new Date(b.receivedAt) : new Date(0);
    return bDate - aDate;
  });

  // สินค้าคงเหลือจะมาจาก batch ที่เข้ามาเก่าที่สุด
  let totalValue = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const batch = sorted[i];
    const qty = batch.quantity || 0;
    const cost = batch.cost || 0;
    totalValue += qty * cost;
  }
  return totalValue;
};

/**
 * WAC: Weighted Average Cost
 * ใช้ราคา average ของทั้งหมด
 * ต้นทุนต่อหน่วย = (รวมต้นทุนทั้งหมด) / (รวมจำนวนทั้งหมด)
 */
const calculateWAC = (batches) => {
  if (batches.length === 0) return 0;

  let totalCost = 0;
  let totalQty = 0;

  batches.forEach((batch) => {
    const qty = batch.quantity || 0;
    const cost = batch.cost || 0;
    totalCost += qty * cost;
    totalQty += qty;
  });

  const averageCost = totalQty > 0 ? totalCost / totalQty : 0;
  return totalQty * averageCost;
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
 * Consume batches ตามลำดับที่กำหนด
 * @param {object} variant - Variant document
 * @param {Array} sortedBatches - Batches ที่จัดเรียงแล้ว
 * @param {number} quantity - จำนวนที่ต้องหัก
 * @param {string} costingMethod - costing method (สำหรับ WAC special handling)
 * @returns {number} - unconsumed quantity
 */
export const consumeBatchesByOrder = (variant, sortedBatches, quantity, costingMethod = 'FIFO') => {
  let remaining = quantity;
  const updated = [];

  for (const batch of sortedBatches) {
    if (remaining <= 0) {
      updated.push(batch);
      continue;
    }

    const available = batch.quantity || 0;
    if (available <= remaining) {
      // Batch ถูกใช้หมด - ไม่เพิ่มเข้า updated
      remaining -= available;
    } else {
      // Batch เหลือบางส่วน
      const newQty = available - remaining;
      const plainBatch = batch.toObject ? batch.toObject() : batch;
      updated.push({ ...plainBatch, quantity: newQty });
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

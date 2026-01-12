import express from 'express';
import StockMovement from '../models/StockMovement.js';
import Product from '../models/Product.js';
import InventoryOrder from '../models/InventoryOrder.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// ============= Helper Functions =============

/**
 * Get IDs of cancelled orders
 */
const getCancelledOrderIds = async () => {
  const cancelledOrders = await InventoryOrder.find({ status: 'cancelled' }, { _id: 1 }).lean();
  return new Set(cancelledOrders.map(o => String(o._id)));
};

// ============= ดูประวัติการเคลื่อนไหว =============

// GET /movements - ดูประวัติทั้งหมด (มี filter)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { productId, variantId, sku, movementType, startDate, endDate, limit = 100, page = 1 } = req.query;

    const filters = {};
    if (productId) filters.productId = productId;
    if (variantId) filters.variantId = variantId;
    if (sku) filters.sku = { $regex: sku, $options: 'i' };
    if (movementType) filters.movementType = movementType;
    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) {
        // เพิ่ม 1 วันเพื่อให้รวมทั้งวัน endDate (ถึง 23:59:59)
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        filters.createdAt.$lt = end;
      }
    }

    // ✅ ดึง ID ของ order ที่ยกเลิก
    const cancelledOrderIds = await getCancelledOrderIds();

    // ✅ เพิ่มเงื่อนไข: ข้าม movements ที่เกี่ยวข้องกับ cancelled orders
    // movements ที่ไม่มี orderId ยังคงแสดง (เช่น manual adjustments)
    if (cancelledOrderIds.size > 0) {
      filters.$or = [
        { orderId: { $exists: false } },                    // ไม่มี orderId
        { orderId: null },                                  // orderId เป็น null
        { orderId: { $nin: Array.from(cancelledOrderIds) } } // orderId ไม่อยู่ในรายการ cancelled
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [movements, total] = await Promise.all([
      StockMovement.find(filters).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      StockMovement.countDocuments(filters),
    ]);

    res.json({
      movements,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /movements/product/:productId - ดูประวัติตามสินค้า
router.get('/product/:productId', authenticateToken, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    // ✅ ดึง ID ของ order ที่ยกเลิก
    const cancelledOrderIds = await getCancelledOrderIds();
    
    const filter = { productId: req.params.productId };
    
    // ✅ เพิ่มเงื่อนไข: ข้าม movements ที่เกี่ยวข้องกับ cancelled orders
    if (cancelledOrderIds.size > 0) {
      filter.$or = [
        { orderId: { $exists: false } },
        { orderId: null },
        { orderId: { $nin: Array.from(cancelledOrderIds) } }
      ];
    }
    
    const movements = await StockMovement.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();
    res.json(movements);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /movements/summary - สรุปการเคลื่อนไหว
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, days = 30 } = req.query;

    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } };
    } else {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - Number(days));
      dateFilter = { createdAt: { $gte: fromDate } };
    }

    // ✅ ดึง ID ของ order ที่ยกเลิก
    const cancelledOrderIds = await getCancelledOrderIds();
    
    // ✅ เพิ่มเงื่อนไข: ข้าม movements ที่เกี่ยวข้องกับ cancelled orders
    const matchFilter = { ...dateFilter };
    if (cancelledOrderIds.size > 0) {
      matchFilter.$or = [
        { orderId: { $exists: false } },
        { orderId: null },
        { orderId: { $nin: Array.from(cancelledOrderIds) } }
      ];
    }

    // สรุปตามประเภท
    const byType = await StockMovement.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$movementType',
          count: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalValue: { $sum: { $multiply: ['$quantity', '$unitCost'] } },
        },
      },
    ]);

    // สรุปรายวัน
    const byDay = await StockMovement.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          inCount: { $sum: { $cond: [{ $in: ['$movementType', ['in', 'return']] }, 1, 0] } },
          outCount: { $sum: { $cond: [{ $in: ['$movementType', ['out', 'damage', 'expired']] }, 1, 0] } },
          adjustCount: { $sum: { $cond: [{ $eq: ['$movementType', 'adjust'] }, 1, 0] } },
          totalIn: { $sum: { $cond: [{ $in: ['$movementType', ['in', 'return']] }, '$quantity', 0] } },
          totalOut: {
            $sum: { $cond: [{ $in: ['$movementType', ['out', 'damage', 'expired']] }, { $abs: '$quantity' }, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // นับรายการวันนี้
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayFilter = { createdAt: { $gte: today }, ...matchFilter };
    
    const todayCount = await StockMovement.countDocuments(todayFilter);

    res.json({
      byType,
      byDay,
      todayCount,
      days: Number(days),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= บันทึกการเคลื่อนไหว (Manual) =============

// POST /movements - บันทึกการปรับปรุงสต็อกแบบ Manual
router.post('/', authenticateToken, authorizeRoles('owner', 'admin', 'hr'), async (req, res) => {
  try {
    const { productId, variantId, sku, movementType, quantity, reason, notes, batchRef, expiryDate, unitCost } =
      req.body;

    // Validate
    if (!productId) return res.status(400).json({ error: 'Product ID is required' });
    if (!movementType) return res.status(400).json({ error: 'Movement type is required' });
    if (!quantity || quantity === 0) return res.status(400).json({ error: 'Quantity is required' });

    // Only allow manual types
    const allowedTypes = ['adjust', 'damage', 'expired', 'return'];
    if (!allowedTypes.includes(movementType)) {
      return res.status(400).json({ error: `Manual movement only allows: ${allowedTypes.join(', ')}` });
    }

    // Find product and variant
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    let variant;
    if (variantId) {
      variant = product.variants.id(variantId);
    } else if (sku) {
      variant = product.variants.find((v) => v.sku === sku);
    } else {
      variant = product.variants[0];
    }

    if (!variant) return res.status(404).json({ error: 'Variant not found' });

    const previousStock = variant.stockOnHand || 0;
    let adjustQty = Number(quantity);

    // Determine adjustment direction
    if (['damage', 'expired'].includes(movementType)) {
      adjustQty = -Math.abs(adjustQty); // Always negative
    } else if (movementType === 'return') {
      adjustQty = Math.abs(adjustQty); // Always positive
    }
    // 'adjust' can be positive or negative as provided

    // ✅ จัดการ batches เพื่อให้ stockOnHand (virtual field) คำนวณถูกต้อง
    if (adjustQty > 0) {
      // เพิ่มสต็อก - สร้าง batch ใหม่
      const newBatch = {
        batchRef: batchRef || `MANUAL-${Date.now()}`,
        supplier: `Manual ${movementType}`,
        cost: unitCost || variant.cost || 0,
        quantity: adjustQty,
        expiryDate: expiryDate || null,
        receivedAt: new Date(),
      };
      variant.batches.push(newBatch);
    } else if (adjustQty < 0) {
      // ลดสต็อก - consume จาก batches (FIFO)
      let remainingToConsume = Math.abs(adjustQty);
      const costingMethod = product.costingMethod || 'FIFO';
      
      // สร้าง array ของ index + receivedAt เพื่อเรียงลำดับ
      const batchIndices = (variant.batches || [])
        .map((b, idx) => ({ 
          index: idx, 
          receivedAt: new Date(b.receivedAt || 0),
          quantity: b.quantity || 0
        }))
        .filter(b => b.quantity > 0) // เอาแค่ที่มีสต็อก
        .sort((a, b) => {
          if (costingMethod === 'LIFO') {
            return b.receivedAt - a.receivedAt; // ใหม่ก่อน
          }
          return a.receivedAt - b.receivedAt; // เก่าก่อน (FIFO/WAC)
        });

      // Consume batches โดยแก้ไขตรงๆ ผ่าน index
      const indicesToRemove = [];
      for (const { index } of batchIndices) {
        if (remainingToConsume <= 0) break;
        
        const batch = variant.batches[index];
        const batchQty = batch.quantity || 0;
        if (batchQty <= 0) continue;

        const consumeFromThisBatch = Math.min(batchQty, remainingToConsume);
        batch.quantity -= consumeFromThisBatch;
        remainingToConsume -= consumeFromThisBatch;
        
        // ถ้าเหลือ 0 เก็บ index ไว้ลบ
        if (batch.quantity <= 0) {
          indicesToRemove.push(index);
        }
      }

      // ลบ batches ที่เหลือ 0 (เรียงจากท้ายไปหน้าเพื่อไม่ให้ index เปลี่ยน)
      for (const idx of indicesToRemove.sort((a, b) => b - a)) {
        variant.batches.splice(idx, 1);
      }

      // ถ้ายังขาดอยู่และไม่อนุญาต backorder
      if (remainingToConsume > 0 && !variant.allowBackorder) {
        return res.status(400).json({
          error: `Insufficient stock. Need ${Math.abs(adjustQty)} but only ${Math.abs(adjustQty) - remainingToConsume} available in batches.`
        });
      }
    }

    // คำนวณ newStock จาก virtual field หลัง update batches
    product.markModified('variants');
    await product.save();
    
    const newStock = variant.stockOnHand || 0;

    // Create movement record
    const movement = new StockMovement({
      movementType,
      productId: product._id,
      productName: product.name,
      variantId: variant._id,
      sku: variant.sku,
      quantity: adjustQty,
      previousStock,
      newStock,
      reason,
      notes,
      batchRef,
      expiryDate,
      unitCost: unitCost || variant.cost || 0,
      createdBy: req.user._id,
      createdByName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.username,
    });

    await movement.save();

    res.status(201).json(movement);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= ฟังก์ชัน Helper สำหรับบันทึกจาก Order =============
// Export function นี้เพื่อใช้ใน inventory.js

export const recordMovement = async ({
  movementType,
  product,
  variant,
  quantity,
  orderId,
  reference,
  reason,
  notes,
  batchRef,
  expiryDate,
  unitCost,
  userId,
  userName,
  previousStock,
  newStock,
}) => {
  try {
    const movement = new StockMovement({
      movementType,
      productId: product._id,
      productName: product.name,
      variantId: variant._id,
      sku: variant.sku,
      quantity,
      previousStock,
      newStock,
      orderId,
      reference,
      reason,
      notes,
      batchRef,
      expiryDate,
      unitCost: unitCost || variant.cost || 0,
      createdBy: userId,
      createdByName: userName,
    });

    await movement.save();
    return movement;
  } catch (error) {
    console.error('Failed to record stock movement:', error);
    // Don't throw - movement recording should not block the main operation
    return null;
  }
};

export default router;

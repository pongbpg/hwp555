import express from 'express';
import Product from '../models/Product.js';
import InventoryOrder from '../models/InventoryOrder.js';
import StockMovement from '../models/StockMovement.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { recordMovement } from './movements.js';
import { checkAndAlertAfterSale, calculateReorderMetrics, calculateAverageDailySalesFromOrders, optimizeOrderWithMOQ } from '../services/stockAlertService.js';
import { calculateInventoryValue, getBatchConsumptionOrder, consumeBatchesByOrder } from '../services/costingService.js';

const router = express.Router();

// ============= Helper Functions =============

/**
 * ดึง cancelled orders และสร้าง set ของ cancelled batchRefs
 * ใช้สำหรับ filter batches ที่เกี่ยวข้องกับ cancelled orders
 */
const getCancelledBatchRefs = async () => {
  const cancelledOrders = await InventoryOrder.find({ status: 'cancelled' }, { _id: 1, reference: 1, items: 1 }).lean();
  const cancelledOrderIds = new Set(cancelledOrders.map(o => String(o._id)));
  const cancelledBatchRefs = new Set();
  
  for (const order of cancelledOrders) {
    for (const item of order.items || []) {
      if (item.batchRef) {
        cancelledBatchRefs.add(item.batchRef);
      }
    }
  }
  
  return { cancelledOrderIds, cancelledBatchRefs };
};

/**
 * ตรวจสอบว่า batch เกี่ยวข้องกับ cancelled order หรือไม่
 */
const isBatchFromCancelledOrder = (batch, cancelledOrderIds, cancelledBatchRefs) => {
  // ถ้า batch มี orderId และ order นั้น cancelled → return true
  if (batch.orderId && cancelledOrderIds.has(String(batch.orderId))) {
    return true;
  }
  // ถ้า batch มี batchRef ที่อยู่ในรายการ cancelled orders → return true
  if (batch.batchRef && cancelledBatchRefs.has(batch.batchRef)) {
    return true;
  }
  return false;
};

const selectVariant = (product, variantId, sku) => {
  if (!product?.variants) return null;
  if (variantId) {
    const variant = product.variants.id(variantId);
    if (variant) return variant;
  }
  if (sku) return product.variants.find((variant) => variant.sku === sku);
  return product.variants[0] || null;
};

const consumeBatches = (variant, product, quantity, metadata = {}) => {
  // If no batch tracking, treat as fully consumable
  if (!variant.batches || variant.batches.length === 0) return 0;

  const costingMethod = product?.costingMethod || 'FIFO';
  const debugStockAlerts = process.env.DEBUG_STOCK_ALERTS === '1' || process.env.DEBUG_STOCK_ALERTS === 'true';

  // Get batches ในลำดับของ costing method
  const sortedBatches = getBatchConsumptionOrder(variant.batches, costingMethod);

  if (debugStockAlerts) {
    const totalBatchQty = sortedBatches.reduce((sum, b) => sum + (b.quantity || 0), 0);
    console.log(`[consumeBatches] SKU: ${variant.sku}, Method: ${costingMethod}, Requested: ${quantity}, Available in batches: ${totalBatchQty}`);
  }

  // ✅ ส่ง metadata เพื่อบันทึกประวัติ
  const remaining = consumeBatchesByOrder(variant, sortedBatches, quantity, costingMethod, metadata);

  if (debugStockAlerts) {
    console.log(`[consumeBatches] Unconsumed quantity: ${remaining}, Remaining batches: ${variant.batches.length}`);
  }

  return remaining;
};

/**
 * Apply stock change to a variant based on order type
 * @param {object} variant - Variant subdocument
 * @param {object} product - Product document
 * @param {object} item - Order item with quantity and other details
 * @param {string} type - Order type: 'purchase' | 'sale' | 'adjustment'
 * @param {object} metadata - Metadata for batch tracking {orderId, orderReference}
 */
const applyStockChange = (variant, product, item, type, metadata = {}) => {
  const qty = Number(item.quantity) || 0;
  if (qty <= 0) throw new Error('Quantity must be greater than zero');

  const debugStockAlerts = process.env.DEBUG_STOCK_ALERTS === '1' || process.env.DEBUG_STOCK_ALERTS === 'true';

  if (type === 'purchase') {
    // ✅ สำหรับ purchase order: เพิ่ม incoming ไว้ก่อน รอรับของจึงบวกสต็อกจริง
    // ไม่สร้าง batch ตอน POST เพราะอาจมีหลาย PO มา และจะทำให้ batch ทับกัน
    // Batch จะสร้างใน PATCH /receive เมื่อมีหลายประกัน PO หลายจำนวน
    variant.incoming = (variant.incoming || 0) + qty;
    return;
  }

  if (type === 'sale') {
    const currentStock = variant.stockOnHand || 0;
    
    if (debugStockAlerts) {
      console.log(`[applyStockChange] SKU: ${variant.sku}, Type: sale, Requested qty: ${qty}, Current stock: ${currentStock}, Has batches: ${(variant.batches && variant.batches.length > 0) ? 'yes' : 'no'}`);
    }

    // ✅ ตรวจสอบ: ถ้าไม่อนุญาต backorder ต้องมีสต็อกพอ
    if (!variant.allowBackorder && currentStock < qty) {
      throw new Error(`Insufficient stock for SKU ${variant.sku}: have ${currentStock}, need ${qty}`);
    }

    // ✅ ไม่เขียน stockOnHand ตรง - คำนวณจาก batch แทน
    // ต้อง consume จาก batches แทน (ลด batch.quantity)

    // ถ้ามี batches ให้ consume ตามวิธี costing method ที่เลือก
    if (variant.batches && variant.batches.length > 0) {
      const totalBatchQty = variant.batches.reduce((sum, b) => sum + (b.quantity || 0), 0);
      const unbatchedQty = currentStock - totalBatchQty; // สต็อกที่ไม่มี batch tracking
      
      if (debugStockAlerts) {
        console.log(`[applyStockChange] Batch analysis - Total batch qty: ${totalBatchQty}, Unbatched qty: ${unbatchedQty}, Total: ${totalBatchQty + unbatchedQty}`);
      }

      // ✅ ตรวจสอบว่า batch มีพอหรือไม่
      // ถ้า totalBatchQty < qty และไม่มี unbatched stock → error
      if (totalBatchQty < qty && unbatchedQty === 0 && !variant.allowBackorder) {
        throw new Error(`Insufficient batch quantities for SKU ${variant.sku}: batch qty ${totalBatchQty} < needed ${qty}`);
      }

      // Snapshot ก่อน consume
      const snapshot = {
        batches: variant.batches.map((batch) => (batch.toObject ? batch.toObject() : { ...batch })),
      };

      // ✅ เลือก consume จาก batch ก่อน ตามวิธี costing method
      // ถ้า batch ไม่พอ ให้หักจาก unbatched stock
      if (totalBatchQty >= qty) {
        // Batch พอเพียง - consume จาก batch (พร้อมส่งข้อมูลการขายเพื่อบันทึก)
        const remaining = consumeBatches(variant, product, qty, metadata);
        
        if (remaining > 0) {
          // ยังมี unconsumed quantity แม้ว่า batch calc บอกว่าพอ
          // นี่ควรไม่เกิด แต่ถ้าเกิด rollback
          if (!variant.allowBackorder) {
            variant.batches = snapshot.batches;
            throw new Error(`Batch consumption mismatch for SKU ${variant.sku}: remain ${remaining}`);
          }
        }
      } else {
        // Batch ไม่พอ - consume all batch + use unbatched stock
        const remaining = consumeBatches(variant, product, qty, metadata);
        
        if (remaining > 0 && unbatchedQty >= remaining) {
          // ✅ ปลอดภัย - unbatched stock คุมครอง remaining
          // สต็อกเดิมที่ไม่มี batch ก็ถูก consume แล้ว
          if (debugStockAlerts) {
            console.log(`[applyStockChange] Using unbatched stock: ${remaining} units`);
          }
        } else if (remaining > 0 && !variant.allowBackorder) {
          // ❌ ยังขาดเหลือ แม้ใช้ unbatched
          variant.batches = snapshot.batches;
          throw new Error(`Insufficient total quantities for SKU ${variant.sku}: need ${qty}, available ${totalBatchQty + unbatchedQty}`);
        }
      }
      
      // ✅ อัพเดต stockOnHand โดยตรง เพื่อให้ virtual field ถูกต้อง
      variant.stockOnHand = currentStock - qty;
    }
    // ✅ ถ้าไม่มี batches และเปิด allowBackorder ให้อนุญาต (สต็อกติดลบ)
    return;
  }

  if (type === 'adjustment') {
    // ✅ สำหรับ adjustment เพิ่ม/ลด stock โดยสร้าง batch ใหม่
    // ถ้า qty > 0 เพิ่ม สต็อก, qty < 0 ลดสต็อก
    const currentStock = variant.stockOnHand || 0;
    
    if (qty > 0) {
      // เพิ่มสต็อก - สร้าง batch ใหม่
      variant.batches.push({
        batchRef: item.batchRef || `ADJ-${Date.now()}`,
        supplier: item.supplier || 'Adjustment',
        cost: item.cost || 0,
        quantity: qty,
        expiryDate: item.expiryDate,
        receivedAt: new Date(),
      });
      // ✅ อัพเดต stockOnHand โดยตรง
      variant.stockOnHand = currentStock + qty;
    } else if (qty < 0) {
      // ลดสต็อก - consume จาก batch (พร้อมส่งข้อมูล metadata)
      const remaining = consumeBatches(variant, product, Math.abs(qty), metadata);
      if (remaining > 0 && !variant.allowBackorder) {
        throw new Error(`Insufficient stock for adjustment on SKU ${variant.sku}: need ${Math.abs(qty)}, available ${Math.abs(qty) - remaining}`);
      }
      // ✅ อัพเดต stockOnHand โดยตรง
      variant.stockOnHand = currentStock - Math.abs(qty);
    }
    return;
  }

  throw new Error('Unsupported order type');
};

router.post('/orders', authenticateToken, authorizeRoles('owner', 'admin', 'hr', 'stock'), async (req, res) => {
  try {
    const { type, items, reference, channel, notes, totals, orderDate } = req.body || {};

    if (!type) return res.status(400).json({ error: 'Order type is required' });
    if (!items || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });

    const orderItems = [];
    const movementRecords = []; // เก็บข้อมูลสำหรับบันทึก movement
    
    // ✅ Phase 1: Prepare order items without applying stock changes yet
    const itemsToProcess = [];
    
    for (const rawItem of items) {
      const product = await Product.findById(rawItem.productId);
      if (!product) return res.status(404).json({ error: `Product ${rawItem.productId} not found` });

      const variant = selectVariant(product, rawItem.variantId, rawItem.sku);
      if (!variant) return res.status(404).json({ error: 'Variant not found on the product' });

      const unitPrice = rawItem.unitPrice ?? variant.price ?? 0;
      const qty = Number(rawItem.quantity) || 0;

      orderItems.push({
        productId: product._id,
        productName: product.name,
        variantId: variant._id,
        sku: variant.sku,
        quantity: qty,
        receivedQuantity: type === 'purchase' ? 0 : qty,
        unitPrice,
        batchRef: rawItem.batchRef,
        expiryDate: rawItem.expiryDate,
        notes: rawItem.notes,
      });
      
      // เก็บข้อมูลสำหรับใช้ใน Phase 2
      itemsToProcess.push({
        product,
        variant,
        rawItem,
        unitPrice,
        qty,
        previousStock: variant.stockOnHand || 0,
      });
    }
    
    // ✅ Phase 2: Create order FIRST so we have orderId to pass to applyStockChange
    const order = new InventoryOrder({
      type,
      status: req.body.status || (type === 'purchase' ? 'pending' : 'completed'),
      orderDate: orderDate ? new Date(orderDate) : new Date(),
      reference,
      channel,
      notes,
      totals,
      placedBy: req.user?._id,
      items: orderItems,
    });

    await order.save();
    
    // ✅ Phase 3: Group items by product and apply stock changes
    // This prevents version conflicts when saving products with multiple variant changes
    const productMap = new Map();
    
    for (const { product, variant, rawItem, unitPrice, qty, previousStock } of itemsToProcess) {
      const productId = String(product._id);
      
      if (!productMap.has(productId)) {
        productMap.set(productId, { product, items: [] });
      }
      
      productMap.get(productId).items.push({
        variant,
        rawItem,
        unitPrice,
        qty,
        previousStock,
      });
    }
    
    // ✅ Phase 4: Process each product once with all its variants
    for (const { product, items: productItems } of productMap.values()) {
      for (const { variant, rawItem, qty, previousStock } of productItems) {
        if (type === 'purchase') {
          // สำหรับใบสั่งซื้อ: เพิ่ม incoming ไว้ก่อน รอรับของจึงบวกสต็อกจริง
          variant.incoming = (variant.incoming || 0) + qty;
        } else {
          // ✅ ส่ง order metadata (orderId, orderReference) ให้ applyStockChange
          applyStockChange(
            variant,
            product,
            { ...rawItem, quantity: qty },
            type,
            {
              orderId: order._id,
              orderReference: order.reference || order._id.toString(),
            }
          );
          
          // ✅ คำนวณ newStock จากการเปลี่ยนแปลงที่ applyStockChange ทำ
          // - type 'sale': previousStock - qty
          // - type 'adjustment': previousStock + qty (qty อาจ positive/negative)
          const adjustQty = type === 'sale' ? -qty : qty;
          const calculatedNewStock = previousStock + adjustQty;
          
          // เก็บข้อมูลสำหรับ movement (ยกเว้น purchase เพราะยังไม่รับของ)
          movementRecords.push({
            movementType: type === 'sale' ? 'out' : 'adjust',
            product,
            variant,
            quantity: adjustQty,
            previousStock,
            newStock: calculatedNewStock,
            reference,
            batchRef: rawItem.batchRef,
            expiryDate: rawItem.expiryDate,
            unitCost: variant.cost || 0,
          });
        }
      }
      
      // Save product ONCE after all its variants are updated
      product.markModified('variants');
      await product.save();
    }
    
    // บันทึก movement records
    const userName = `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || req.user?.username;
    for (const rec of movementRecords) {
      await recordMovement({
        ...rec,
        orderId: order._id,
        userId: req.user._id,
        userName,
      });
    }
    
    // ตรวจสอบและแจ้งเตือน LINE หากสินค้าใกล้หมด (สำหรับการขาย)
    let stockAlertResult = null;
    if (type === 'sale') {
      const soldItems = orderItems.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      }));
      
      // ตรวจสอบและส่งแจ้งเตือนแบบ async (ไม่ block response)
      // ✅ ส่ง sendNotification: true เพื่อให้ checkAndAlertAfterSale ใช้ leadTime+bufferDays ในการคำนวณ
      checkAndAlertAfterSale(soldItems, { sendNotification: true })
        .then((result) => {
          if (result.alertCount > 0) {
            console.log(`📢 Stock alert sent for ${result.alertCount} items`);
          }
        })
        .catch((err) => {
          console.error('Error checking stock alerts:', err);
        });
    }
    
    res.status(201).json(order);
  } catch (error) {
    const lowered = (error.message || '').toLowerCase();
    const isClientError = ['insufficient', 'quantity must'].some((phrase) => lowered.includes(phrase));
    res.status(isClientError ? 400 : 500).json({ error: error.message });
  }
});

// รับของสำหรับใบสั่งซื้อ
router.patch('/orders/:id/receive', authenticateToken, authorizeRoles('owner', 'admin', 'hr', 'stock'), async (req, res) => {
  try {
    const order = await InventoryOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.type !== 'purchase') return res.status(400).json({ error: 'Receive is only for purchase orders' });
    if (order.status === 'cancelled') return res.status(400).json({ error: 'Order is cancelled' });

    const receivedMap = new Map();
    for (const it of req.body.items || []) {
      if (!it.variantId) continue;
      const qty = Math.max(0, Number(it.receivedQuantity) || 0);
      receivedMap.set(String(it.variantId), qty);
    }

    // load products once per productId
    const productCache = new Map();
    const movementRecords = []; // เก็บข้อมูลสำหรับบันทึก movement

    for (const item of order.items) {
      const key = String(item.variantId);
      if (!receivedMap.has(key)) continue;
      const newReceived = Math.min(item.quantity, receivedMap.get(key));
      const delta = newReceived - (item.receivedQuantity || 0);
      if (delta <= 0) continue;

      const productId = String(item.productId);
      let product = productCache.get(productId);
      if (!product) {
        product = await Product.findById(productId);
        if (!product) return res.status(404).json({ error: `Product ${productId} not found` });
        productCache.set(productId, product);
      }
      const variant = selectVariant(product, item.variantId, item.sku);
      if (!variant) return res.status(404).json({ error: 'Variant not found on the product' });

      const previousStock = variant.stockOnHand || 0;
      // ✅ ไม่เขียน stockOnHand ตรง - สร้าง batch แทน
      variant.incoming = Math.max(0, (variant.incoming || 0) - delta);
      item.receivedQuantity = newReceived;

      // สร้างเลขล็อตอัตโนมัติ (ถ้าไม่ได้ระบุ)
      const generateBatchRef = () => {
        const now = new Date();
        const dateStr = now.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
        const timeStr = now.toISOString().slice(11, 16).replace(':', ''); // HHMM
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `LOT${dateStr}-${timeStr}-${random}`;
      };

      // ✅ สร้าง batch ใหม่เสมอ พร้อม orderId เพื่อ link กับ order นี้
      // ดังนี้ batch จะไม่ถูกจับใหม่เมื่อ receive PO อื่น
      const createdBatchRef = item.batchRef || generateBatchRef();
      variant.batches.push({
        batchRef: createdBatchRef,
        supplier: item.supplier || 'Direct',
        cost: item.unitPrice || 0, // ✅ บันทึก cost จาก InventoryOrder.unitPrice
        quantity: delta,
        expiryDate: item.expiryDate,
        receivedAt: new Date(),
        orderId: order._id, // ✅ Link batch กับ order นี้ เพื่อป้องกัน overwrite
      });
      item.batchRef = createdBatchRef;
      
      // เก็บข้อมูลสำหรับ movement
      // newStock คำนวณจาก batch ใหม่
      const newStock = previousStock + delta;
      movementRecords.push({
        movementType: 'in',
        product,
        variant,
        quantity: delta,
        previousStock,
        newStock,
        reference: order.reference,
        batchRef: item.batchRef,
        expiryDate: item.expiryDate,
        unitCost: item.unitPrice || 0,
      });
    }

    // Save all products
    for (const p of productCache.values()) {
      p.markModified('variants');
      await p.save();
    }

    // Update order status
    const allReceived = order.items.every((it) => (it.receivedQuantity || 0) >= (it.quantity || 0));
    order.status = allReceived ? 'completed' : 'pending';
    await order.save();
    
    // บันทึก movement records
    const userName = `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || req.user?.username;
    for (const rec of movementRecords) {
      await recordMovement({
        ...rec,
        orderId: order._id,
        userId: req.user._id,
        userName,
      });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ยกเลิก order (rollback stock)
router.patch('/orders/:id/cancel', authenticateToken, authorizeRoles('owner', 'admin', 'hr'), async (req, res) => {
  try {
    const order = await InventoryOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'cancelled') return res.status(400).json({ error: 'Order is already cancelled' });

    const productCache = new Map();
    
    // ✅ Phase 1: Validation - ตรวจสอบว่าสามารถยกเลิกได้หรือไม่
    if (order.type === 'purchase') {
      for (const item of order.items) {
        const productId = String(item.productId);
        let product = productCache.get(productId);
        if (!product) {
          product = await Product.findById(productId);
          if (!product) continue;
          productCache.set(productId, product);
        }
        const variant = selectVariant(product, item.variantId, item.sku);
        if (!variant) continue;

        const qty = Number(item.quantity) || 0;
        const receivedQty = Number(item.receivedQuantity) || 0;
        const currentStockOnHand = variant.stockOnHand || 0;

        // ตรวจสอบว่าถ้าลด receivedQty ออก สต็อกจะติดลบหรือไม่
        // (ยกเว้นถ้า allowBackorder เปิดอยู่)
        if (!variant.allowBackorder && currentStockOnHand < receivedQty) {
          return res.status(400).json({
            error: `Cannot cancel order: SKU ${variant.sku} has only ${currentStockOnHand} units but received ${receivedQty}. ` +
                   `Insufficient stock to reverse this purchase.`
          });
        }
      }
    }

    // ✅ Phase 2: Rollback - ทำการยกเลิกและต้นฉบับสต็อก
    productCache.clear(); // ล้าง cache และโหลดใหม่
    
    for (const item of order.items) {
      const productId = String(item.productId);
      let product = productCache.get(productId);
      if (!product) {
        product = await Product.findById(productId);
        if (!product) continue; // skip if product deleted
        productCache.set(productId, product);
      }
      const variant = selectVariant(product, item.variantId, item.sku);
      if (!variant) continue;

      const qty = Number(item.quantity) || 0;
      const receivedQty = Number(item.receivedQuantity) || 0;

      if (order.type === 'purchase') {
        // Rollback: ลด incoming ที่ยังไม่รับ และลบ batches ที่สร้างจากการรับของ
        const pendingQty = qty - receivedQty;
        variant.incoming = Math.max(0, (variant.incoming || 0) - pendingQty);
        
        // ✅ ลบ batches ที่สัมพันธ์กับ order นี้ (ไม่ต้องลด stockOnHand เพราะเป็น virtual)
        // batches ที่หายเพราะการลบนี้ ทำให้ stockOnHand ลดอัตโนมัติ
        const debugStockAlerts = process.env.DEBUG_STOCK_ALERTS === '1' || process.env.DEBUG_STOCK_ALERTS === 'true';
        if (debugStockAlerts) {
          console.log(`[Cancel Order] Order ID: ${order._id}, Variant: ${variant.sku}`);
          console.log(`[Cancel Order] Batches before filter:`, variant.batches.map(b => ({
            batchRef: b.batchRef,
            orderId: b.orderId,
            orderIdString: String(b.orderId),
          })));
        }
        
        variant.batches = (variant.batches || []).filter((b) => {
          const shouldKeep = !b.orderId || String(b.orderId) !== String(order._id);
          if (debugStockAlerts && !shouldKeep) {
            console.log(`[Cancel Order] Removing batch: ${b.batchRef} (orderId: ${b.orderId})`);
          }
          return shouldKeep;
        });
        
        if (debugStockAlerts) {
          console.log(`[Cancel Order] Batches after filter:`, variant.batches.map(b => b.batchRef));
        }
      } else if (order.type === 'sale') {
        // Rollback: คืน batch กลับ (ต้องสร้าง batch ใหม่)
        // เพราะ batches ถูก consume ไปแล้ว ต้องคืนกลับ
        const batchRefToRestore = `RETURN-${order._id}-${Date.now()}`;
        const qty = Number(item.quantity) || 0;
        variant.batches.push({
          batchRef: batchRefToRestore,
          supplier: `Return from ${order.reference || 'cancelled sale'}`,
          cost: 0,
          quantity: qty,
          receivedAt: new Date(),
        });
      } else if (order.type === 'adjustment') {
        // Rollback: ลบ adjustment batch ออก
        // ถ้า qty > 0 ลบ batch ที่สร้าง, ถ้า qty < 0 สร้าง batch ใหม่กลับ
        const qty = Number(item.quantity) || 0;
        if (qty > 0) {
          // เดิมเพิ่มสต็อก → ต้องลบ batch ที่เพิ่มไป
          // ลบ batch ที่ batchRef เริ่มด้วย ADJ
          variant.batches = (variant.batches || []).filter((b) => !b.batchRef?.startsWith('ADJ'));
        } else if (qty < 0) {
          // เดิมลดสต็อก → ต้องสร้าง batch ใหม่
          variant.batches.push({
            batchRef: `ADJ-REVERSE-${Date.now()}`,
            supplier: 'Adjustment Reverse',
            cost: 0,
            quantity: Math.abs(qty),
            receivedAt: new Date(),
          });
        }
      }
    }

    // Save all products
    for (const p of productCache.values()) {
      p.markModified('variants');
      await p.save();
    }

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.cancelledBy = req.user?._id;
    order.cancelReason = req.body.reason || '';
    await order.save();

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// แก้ไข order (เฉพาะ reference, notes, channel)
router.patch('/orders/:id', authenticateToken, authorizeRoles('owner', 'admin', 'hr'), async (req, res) => {
  try {
    const order = await InventoryOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'cancelled') return res.status(400).json({ error: 'Cannot edit cancelled order' });

    const { reference, notes, channel, orderDate } = req.body;
    
    if (reference !== undefined) order.reference = reference;
    if (notes !== undefined) order.notes = notes;
    if (channel !== undefined) order.channel = channel;
    if (orderDate !== undefined) order.orderDate = new Date(orderDate);

    order.updatedBy = req.user?._id;
    await order.save();

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List inventory orders with pagination
router.get('/orders', authenticateToken, authorizeRoles('owner', 'admin', 'hr'), async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const type = req.query.type; // optional filter: sale, purchase, adjustment
    const status = req.query.status; // optional filter: pending, completed, cancelled
    const q = (req.query.q || '').trim(); // optional search by reference or productName

    const match = {};
    if (type) match.type = type;
    if (status) match.status = status;

    // Basic search by reference substring
    if (q) {
      match.$or = [
        { reference: { $regex: q, $options: 'i' } },
        { notes: { $regex: q, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      InventoryOrder.aggregate([
        { $match: match },
        {
          $addFields: {
            // Priority: pending purchase orders (type=purchase && status=pending) come first
            sortPriority: {
              $cond: [
                { $and: [{ $eq: ['$type', 'purchase'] }, { $eq: ['$status', 'pending'] }] },
                0, // pending purchase = highest priority
                1  // everything else
              ]
            }
          }
        },
        {
          $sort: {
            sortPriority: 1,      // pending purchase first
            orderDate: -1,        // then by date (newest first)
            createdAt: -1         // fallback
          }
        },
        { $skip: skip },
        { $limit: limit }
      ]),
      InventoryOrder.countDocuments(match),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    res.json({ items, total, page, limit, totalPages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/insights', authenticateToken, authorizeRoles('owner', 'stock'), async (req, res) => {
  try {
    const now = new Date();
    const expiryDays = Number(req.query.expiryDays) || 30;
    const days = Number(req.query.days) || 30; // ✅ ประกาศ days ข้างนอก if/else
    
    // ✅ รองรับ dateFrom และ dateTo หรือ days
    let salesSince;
    if (req.query.dateFrom && req.query.dateTo) {
      // ถ้าระบุช่วงวันที่ ให้ใช้ช่วงนั้น
      salesSince = new Date(req.query.dateFrom);
      const dateToObj = new Date(req.query.dateTo);
      // ตั้งให้จบวันสุดท้ายนี้
      dateToObj.setHours(23, 59, 59, 999);
    } else {
      // ถ้าไม่ระบุ ให้ใช้ days (default 30)
      salesSince = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }
    
    const expiryBefore = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000);

    // ✅ Determine salesPeriodDays for calculations
    const salesPeriodDays = req.query.dateFrom && req.query.dateTo
      ? Math.ceil((new Date(req.query.dateTo) - new Date(req.query.dateFrom)) / (1000 * 60 * 60 * 24)) + 1
      : (Number(req.query.days) || 30);

    // คำนวณยอดขาย (ใช้ orderDate แทน createdAt เพื่อความถูกต้อง)
    const salesData = await InventoryOrder.aggregate([
      { $match: { type: 'sale', orderDate: { $gte: salesSince }, status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: {
            productId: '$items.productId',
            variantId: '$items.variantId',
            sku: '$items.sku',
            productName: '$items.productName',
          },
          quantitySold: { $sum: '$items.quantity' },
        },
      },
      {
        $project: {
          productId: '$_id.productId',
          variantId: '$_id.variantId',
          sku: '$_id.sku',
          productName: '$_id.productName',
          quantitySold: 1,
        },
      },
    ]);

    // สร้าง Map ของยอดขาย
    const salesMap = new Map();
    salesData.forEach((sale) => {
      const key = `${sale.productId}-${sale.variantId}`;
      salesMap.set(key, sale.quantitySold);
    });

    // ดึงสินค้าทั้งหมดพร้อม variants
    // ⚠️ ไม่ใช้ .lean() เพื่อให้ virtual field (stockOnHand) ถูกคำนวณ
    const products = await Product.find();
    const [categoriesAll, brandsAll] = await Promise.all([
      Category.find().lean(),
      Brand.find().lean(),
    ]);
    const categoryNameMap = new Map(categoriesAll.map((c) => [String(c._id), c.name]));
    const brandNameMap = new Map(brandsAll.map((b) => [String(b._id), b.name]));
    const reorderSuggestions = [];
    const lowStock = [];
    const fastMoversDetailed = [];
    const groupByCategory = new Map();
    const groupByBrand = new Map();

    // Group variants by product first for MOQ optimization
    const productVariantMap = new Map();
    products.forEach((product) => {
      if (!productVariantMap.has(String(product._id))) {
        productVariantMap.set(String(product._id), { product, variants: [] });
      }
      (product.variants || []).forEach((variant) => {
        productVariantMap.get(String(product._id)).variants.push(variant);
      });
    });

    // Process each product group for MOQ optimization
    for (const [productId, { product, variants }] of productVariantMap) {
      const variantSuggestions = []; // Temporary holder for this product's variants

      variants.forEach((variant) => {
        const key = `${product._id}-${variant._id}`;
        const quantitySold = salesMap.get(key) || 0;
        const dailySalesRate = quantitySold / salesPeriodDays;
        const incoming = variant.incoming || 0;
        const currentStock = (variant.stockOnHand || 0) + incoming;
        const leadTimeDays = product.leadTimeDays || 7;
        const bufferDays = product.reorderBufferDays ?? 7;
        const minimumDays = leadTimeDays + bufferDays;

        // คำนวณว่าสต็อกปัจจุบันพอใช้กี่วัน
        const daysUntilStockOut = dailySalesRate > 0 ? currentStock / dailySalesRate : 999999;

        // บันทึก fast movers รายละเอียด
        if (dailySalesRate > 0) {
          fastMoversDetailed.push({
            productId: product._id,
            productName: product.name,
            categoryId: product.category || null,
            categoryName: categoryNameMap.get(String(product.category)) || 'Uncategorized',
            brandId: product.brand || null,
            brandName: brandNameMap.get(String(product.brand)) || 'Unbranded',
            variantId: variant._id,
            sku: variant.sku,
            quantitySold,
            dailySalesRate: Math.round(dailySalesRate * 100) / 100,
            currentStock,
            incoming,
            daysRemaining: Math.round(daysUntilStockOut * 10) / 10,
          });
        }

        // กลุ่มตามหมวดหมู่และยี่ห้อ
        const catId = product.category || null;
        const brandId = product.brand || null;
        const catLabel = categoryNameMap.get(String(catId)) || 'Uncategorized';
        const brandLabel = brandNameMap.get(String(brandId)) || 'Unbranded';
        const catKey = String(catId || 'uncategorized');
        const brandKey = String(brandId || 'unbranded');
        const cat = groupByCategory.get(catKey) || { categoryId: catId, categoryName: catLabel, totalSold: 0, totalStock: 0, dailySalesRate: 0 };
        const br = groupByBrand.get(brandKey) || { brandId: brandId, brandName: brandLabel, totalSold: 0, totalStock: 0, dailySalesRate: 0 };
        cat.totalSold += quantitySold;
        cat.totalStock += currentStock;
        cat.dailySalesRate += dailySalesRate;
        br.totalSold += quantitySold;
        br.totalStock += currentStock;
        br.dailySalesRate += dailySalesRate;
        groupByCategory.set(catKey, cat);
        groupByBrand.set(brandKey, br);

        // ถ้าสต็อกไม่พอใช้ถึง lead time + buffer
        const reorderMetrics = calculateReorderMetrics(dailySalesRate, leadTimeDays, bufferDays);
        const suggestedReorderPoint = reorderMetrics.suggestedReorderPoint;
        const suggestedOrderQty = reorderMetrics.suggestedReorderQty;

        // ✅ รวมเงื่อนไข: 
        // 1. สต็อกไม่พอช่วง lead time + buffer
        // 2. สินค้าหมดสต็อก (currentStock <= 0) แม้ไม่มีประวัติการขาย
        const isOutOfStock = currentStock <= 0;
        const isLowStock = daysUntilStockOut < minimumDays;
        
        if (isOutOfStock || isLowStock) {
          const recommendedOrderQty = Math.max(
            suggestedOrderQty,  // ✅ ถ้า out-of-stock ไม่มีการขาย ให้ใช้ suggestedOrderQty (minOrderQty หรือ lead time * buffer)
            Math.max(0, suggestedOrderQty - currentStock)
          );

          // ✅ สั่งซื้อแม้ recommendedOrderQty = 0 ถ้าเป็น out-of-stock
          if (recommendedOrderQty > 0 || isOutOfStock) {
            variantSuggestions.push({
              productId: product._id,
              productName: product.name,
              variantId: variant._id,
              sku: variant.sku,
              currentStock,
              incoming,
              quantitySold,
              dailySalesRate: Math.round(dailySalesRate * 100) / 100,
              daysUntilStockOut: isOutOfStock ? 0 : Math.round(daysUntilStockOut * 10) / 10,
              suggestedReorderPoint: Math.ceil(suggestedReorderPoint),
              suggestedOrderQty: Math.ceil(suggestedOrderQty),
              recommendedOrderQty: Math.ceil(recommendedOrderQty),
              leadTimeDays,
              bufferDays,
              minOrderQty: product.minOrderQty || 0,
              avgDailySales: dailySalesRate,
              enableStockAlerts: product.enableStockAlerts,
            });

            lowStock.push({
              productId: product._id,
              productName: product.name,
              variantId: variant._id,
              sku: variant.sku,
              stockOnHand: currentStock,
              leadTimeDays,
              daysRemaining: isOutOfStock ? 0 : Math.round(daysUntilStockOut * 10) / 10,
            });
          }
        }
      });

      // Apply MOQ optimization if this product has MOQ and has variants needing reorder
      if (variantSuggestions.length > 0 && product.minOrderQty > 0) {
        const optimizedVariants = optimizeOrderWithMOQ(product, variantSuggestions);
        reorderSuggestions.push(...optimizedVariants);
      } else if (variantSuggestions.length > 0) {
        // No MOQ, just add as-is
        reorderSuggestions.push(...variantSuggestions);
      }
    }

    // เรียงตามความเร่งด่วน (วันที่เหลือน้อยที่สุด)
    reorderSuggestions.sort((a, b) => a.daysUntilStockOut - b.daysUntilStockOut);
    lowStock.sort((a, b) => a.daysRemaining - b.daysRemaining);

    // ดึง cancelled order batches data
    const { cancelledOrderIds, cancelledBatchRefs } = await getCancelledBatchRefs();

    const nearExpiry = await Product.aggregate([
      { $unwind: '$variants' },
      { $unwind: '$variants.batches' },
      { $match: { 'variants.batches.expiryDate': { $lte: expiryBefore, $gte: now } } },
      {
        $project: {
          productId: '$_id',
          productName: '$name',
          variantId: '$variants._id',
          sku: '$variants.sku',
          batchRef: '$variants.batches.batchRef',
          orderId: '$variants.batches.orderId',
          expiryDate: '$variants.batches.expiryDate',
          quantity: '$variants.batches.quantity',
        },
      },
      { $sort: { expiryDate: 1 } },
    ]);

    // Filter out batches from cancelled orders
    const filteredNearExpiry = nearExpiry.filter((item) => {
      return !isBatchFromCancelledOrder(
        { orderId: item.orderId, batchRef: item.batchRef },
        cancelledOrderIds,
        cancelledBatchRefs
      );
    });

    const fastMovers = fastMoversDetailed.sort((a, b) => b.quantitySold - a.quantitySold);

    // ✅ หาสินค้าขายไม่ออก (Dead Stock) - ไม่มีการขายเลยในช่วง
    const deadStockDetailed = [];
    for (const [productId, { product, variants }] of productVariantMap) {
      variants.forEach((variant) => {
        const key = `${product._id}-${variant._id}`;
        const quantitySold = salesMap.get(key) || 0;
        
        // ตรวจสอบเฉพาะ variants ที่ไม่มีการขายแล้วมีสต็อกอยู่
        if (quantitySold === 0) {
          const currentStock = (variant.stockOnHand || 0) + (variant.incoming || 0);
          if (currentStock > 0) {  // มีสต็อกแต่ไม่มีการขาย
            deadStockDetailed.push({
              productId: product._id,
              productName: product.name,
              categoryId: product.category || null,
              categoryName: categoryNameMap.get(String(product.category)) || 'Uncategorized',
              brandId: product.brand || null,
              brandName: brandNameMap.get(String(product.brand)) || 'Unbranded',
              variantId: variant._id,
              sku: variant.sku,
              currentStock,
              incoming: variant.incoming || 0,
              quantitySold: 0,
              dailySalesRate: 0,
            });
          }
        }
      });
    }
    
    // เรียงตามจำนวนสต็อก (มากสุดก่อน)
    const deadStock = deadStockDetailed.sort((a, b) => b.currentStock - a.currentStock);

    // จัดรูป grouped summaries
    const categorySummaries = Array.from(groupByCategory.values())
      .map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        totalSold: c.totalSold,
        totalStock: c.totalStock,
        dailySalesRate: Math.round(c.dailySalesRate * 100) / 100,
        daysRemaining: c.dailySalesRate > 0 ? Math.round((c.totalStock / c.dailySalesRate) * 10) / 10 : 999999,
      }))
      .sort((a, b) => b.totalSold - a.totalSold);
    const brandSummaries = Array.from(groupByBrand.values())
      .map((c) => ({
        brandId: c.brandId,
        brandName: c.brandName,
        totalSold: c.totalSold,
        totalStock: c.totalStock,
        dailySalesRate: Math.round(c.dailySalesRate * 100) / 100,
        daysRemaining: c.dailySalesRate > 0 ? Math.round((c.totalStock / c.dailySalesRate) * 10) / 10 : 999999,
      }))
      .sort((a, b) => b.totalSold - a.totalSold);

    res.json({
      lowStock,
      nearExpiry: filteredNearExpiry,
      fastMovers,
      deadStock,
      reorderSuggestions,
      categorySummaries,
      brandSummaries,
      meta: {
        days,
        counts: {
          lowStock: lowStock.length,
          nearExpiry: filteredNearExpiry.length,
          fastMovers: fastMovers.length,
          deadStock: deadStock.length,
          reorderSuggestions: reorderSuggestions.length,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= Dashboard Summary =============
router.get('/dashboard', authenticateToken, authorizeRoles('owner', 'stock'), async (req, res) => {
  try {
    const products = await Product.find({ status: 'active' });  // ✅ ลบ .lean() เพื่อให้ virtual field ทำงาน
    
    // Fetch categories and brands for name lookup
    const [categoriesList, brandsList] = await Promise.all([
      Category.find({}).lean(),
      Brand.find({}).lean()
    ]);
    
    // Create lookup maps (id -> name)
    const categoryMap = {};
    categoriesList.forEach(cat => { categoryMap[cat._id.toString()] = cat.name; });
    const brandMap = {};
    brandsList.forEach(brand => { brandMap[brand._id.toString()] = brand.name; });
    
    let totalProducts = 0;
    let totalVariants = 0;
    let totalStock = 0;
    let totalValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let normalStockCount = 0;
    const categoryStock = {};
    const brandStock = {};
    
    products.forEach((product) => {
      totalProducts++;
      (product.variants || []).forEach((variant) => {
        if (variant.status !== 'active') return;
        totalVariants++;
        const stock = variant.stockOnHand || 0;
        const reorderPoint = variant.reorderPoint || 0;
        
        // ✅ คำนวณ totalValue ตาม batch โดยใช้ costing method ของสินค้า
        // 💡 Handle case where costingMethod might be undefined in old documents
        const costingMethod = product.costingMethod || 'FIFO';
        const variantValue = calculateInventoryValue(variant, costingMethod);
        
        totalValue += variantValue;
        
        totalStock += stock;
        
        if (stock <= 0) {
          outOfStockCount++;
        } else if (stock <= reorderPoint) {
          lowStockCount++;
        } else {
          normalStockCount++;
        }
        
        // Group by category (lookup name from map)
        const catId = product.category || '';
        const catName = categoryMap[catId] || 'ไม่ระบุ';
        if (!categoryStock[catName]) categoryStock[catName] = { stock: 0, value: 0, count: 0 };
        categoryStock[catName].stock += stock;
        categoryStock[catName].value += variantValue;
        categoryStock[catName].count++;
        
        // Group by brand (lookup name from map)
        const brandId = product.brand || '';
        const brandName = brandMap[brandId] || 'ไม่ระบุ';
        if (!brandStock[brandName]) brandStock[brandName] = { stock: 0, value: 0, count: 0 };
        brandStock[brandName].stock += stock;
        brandStock[brandName].value += variantValue;
        brandStock[brandName].count++;
      });
    });
    
    // วันนี้มี orders กี่รายการ
    // Date range support for sales calculations
    const now = new Date();
    let salesSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // default 30 days
    let salesUntil = new Date();
    salesUntil.setHours(23, 59, 59, 999);
    let salesPeriodDays = 30;

    // Support custom date range
    if (req.query.dateFrom && req.query.dateTo) {
      salesSince = new Date(req.query.dateFrom);
      salesUntil = new Date(req.query.dateTo);
      salesUntil.setHours(23, 59, 59, 999);
      salesPeriodDays = Math.ceil((salesUntil - salesSince) / (1000 * 60 * 60 * 24)) + 1;
    } else if (req.query.days) {
      const days = Number(req.query.days) || 30;
      salesSince = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      salesPeriodDays = days;
    }

    // Count orders for the date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ordersToday = await InventoryOrder.countDocuments({ 
      createdAt: { $gte: today },
      orderDate: { $gte: salesSince, $lte: salesUntil }
    });
    const pendingOrders = await InventoryOrder.countDocuments({ status: 'pending' });
    
    // Movement summary (use same date range)
    const sevenDaysAgo = req.query.dateFrom ? salesSince : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const StockMovement = (await import('../models/StockMovement.js')).default;
    
    const movementByType = await StockMovement.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: '$movementType', count: { $sum: 1 }, totalQuantity: { $sum: '$quantity' } } }
    ]);
    
    // Movement trend (7 days)
    const movementTrend = await StockMovement.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%m/%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    // Alert counts
    const expiryBefore = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    // ดึง cancelled order batches data
    const { cancelledOrderIds, cancelledBatchRefs } = await getCancelledBatchRefs();
    
    let nearExpiryCount = 0;
    products.forEach((product) => {
      (product.variants || []).forEach((variant) => {
        (variant.batches || []).forEach((batch) => {
          // ข้าม batches จาก cancelled orders
          if (isBatchFromCancelledOrder(batch, cancelledOrderIds, cancelledBatchRefs)) {
            return;
          }
          if (batch.expiryDate && new Date(batch.expiryDate) <= expiryBefore && new Date(batch.expiryDate) >= now) {
            nearExpiryCount++;
          }
        });
      });
    });
    
    // Get reorder suggestions (items needing to be ordered)
    // ใช้ลอจิกเดียวกับ Alerts API เพื่อให้สอดคล้องกัน
    const toReorderItems = [];
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // ดึงยอดขาย 30 วันย้อนหลัง
    const salesDataForReorder = await InventoryOrder.aggregate([
      { $match: { type: 'sale', orderDate: { $gte: thirtyDaysAgo }, status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: { variantId: '$items.variantId' },
          quantitySold: { $sum: '$items.quantity' },
        },
      },
    ]);
    
    const salesByVariantReorder = new Map();
    salesDataForReorder.forEach((s) => {
      const key = String(s._id.variantId);
      salesByVariantReorder.set(key, s.quantitySold || 0);
    });
    
    products.forEach((product) => {
      if (!product.enableStockAlerts) return;
      (product.variants || []).forEach((variant) => {
        if (variant.status !== 'active') return;
        const stock = variant.stockOnHand || 0;
        const reorderPoint = variant.reorderPoint || 0;
        const leadTimeDays = product.leadTimeDays || 7;
        const bufferDays = product.reorderBufferDays ?? 7;
        
        // คำนวณ daily sales rate
        const variantKey = String(variant._id);
        const quantitySold = salesByVariantReorder.get(variantKey) || 0;
        const dailySalesRate = quantitySold / 30;
        
        // ใช้ calculateReorderMetrics เหมือน Alerts
        const reorderMetrics = calculateReorderMetrics(dailySalesRate, leadTimeDays, bufferDays);
        const computedReorderPoint = Math.ceil(reorderMetrics.suggestedReorderPoint);
        const minimumDays = leadTimeDays + bufferDays;
        const daysUntilStockOut = dailySalesRate > 0 ? stock / dailySalesRate : 999;
        
        // รวมเงื่อนไข: หมดสต็อก หรือ สต็อกต่ำ หรือ วันคงเหลือน้อยกว่า lead time + buffer
        const shouldAlert = stock <= 0 || stock <= reorderPoint || (dailySalesRate > 0 && daysUntilStockOut < minimumDays);
        
        if (shouldAlert) {
          toReorderItems.push({
            productId: product._id,
            productName: product.name,
            variantId: variant._id,
            sku: variant.sku,
            currentStock: stock,
            reorderPoint: reorderPoint || computedReorderPoint,
          });
        }
      });
    });
    
    // Get pending purchase orders (inbound today)
    const inboundOrders = await InventoryOrder.find({
      type: 'purchase',
      status: { $in: ['pending', 'completed'] },
    }).lean().limit(10);
    
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const inboundToday = inboundOrders.filter(order => {
      const orderDate = new Date(order.orderDate || order.createdAt);
      return orderDate >= todayStart;
    }).slice(0, 5).map(order => ({
      id: order._id,
      reference: order.reference,
      status: order.status,
      itemCount: (order.items || []).length,
      totalQty: (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0),
      receivedQty: (order.items || []).reduce((sum, item) => sum + (item.receivedQuantity || 0), 0),
    }));
    
    // Get recent activities (last 15 stock movements)
    const recentActivities = await StockMovement.find()
      .populate({
        path: 'createdBy',
        select: 'firstName lastName username',
        model: 'Employee'
      })
      .select('movementType quantity sku createdBy createdByName createdAt')
      .sort({ createdAt: -1 })
      .limit(15)
      .lean();
    
    const activitiesData = recentActivities.map(activity => {
      // Build userName from createdBy (populated Employee) or createdByName (fallback)
      let userName = 'System';
      if (activity.createdBy) {
        const emp = activity.createdBy;
        const firstName = emp.firstName || '';
        const lastName = emp.lastName || '';
        const combined = `${firstName} ${lastName}`.trim();
        userName = combined || emp.username || 'System';
      } else if (activity.createdByName) {
        userName = activity.createdByName;
      }
      
      return {
        id: activity._id,
        type: activity.movementType,
        quantity: Math.abs(activity.quantity),
        direction: activity.quantity > 0 ? 'in' : 'out',
        sku: activity.sku || 'Unknown',
        variant: '',
        userName,
        timestamp: new Date(activity.createdAt),
      };
    });
    
    // Get sales data for last 7 days by date
    const sevenDaysStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    sevenDaysStart.setHours(0, 0, 0, 0);
    
    const ordersByDay = await InventoryOrder.aggregate([
      {
        $match: {
          type: 'sale',
          status: { $ne: 'cancelled' },
          orderDate: { $gte: sevenDaysStart, $lte: now }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%m/%d', date: '$orderDate' } },
          count: { $sum: 1 },
          totalQty: { $sum: { $sum: '$items.quantity' } }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    const dailyOrderVolume = ordersByDay.map(day => ({
      date: day._id,
      orders: day.count,
      qty: day.totalQty
    }));
    
    // Get today's top sales
    const todaySales = await InventoryOrder.aggregate([
      {
        $match: {
          type: 'sale',
          status: { $ne: 'cancelled' },
          orderDate: { $gte: todayStart, $lte: now }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: {
            productId: '$items.productId',
            productName: '$items.productName',
            sku: '$items.sku',
          },
          quantitySold: { $sum: '$items.quantity' }
        }
      },
      { $sort: { quantitySold: -1 } },
      { $limit: 5 }
    ]);
    
    const topSalestoday = todaySales.map(sale => ({
      productName: sale._id.productName,
      sku: sale._id.sku,
      quantitySold: sale.quantitySold
    }));
    
    res.json({
      summary: {
        totalProducts,
        totalVariants,
        totalStock,
        totalValue: Math.round(totalValue * 100) / 100,
        lowStockCount,
        outOfStockCount,
        normalStockCount,
        ordersToday,
        pendingOrders,
      },
      alerts: {
        total: outOfStockCount + lowStockCount + nearExpiryCount,
        critical: outOfStockCount,
        warning: lowStockCount + nearExpiryCount,
        outOfStock: outOfStockCount,
        lowStock: lowStockCount,
        nearExpiry: nearExpiryCount,
      },
      movements: {
        byType: movementByType,
      },
      movementTrend: movementTrend.map(m => ({ date: m._id, count: m.count })),
      byCategory: Object.entries(categoryStock)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.stock - a.stock),
      byBrand: Object.entries(brandStock)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.stock - a.stock),
      // New data for dashboard
      toReorder: toReorderItems.slice(0, 10),
      inboundToday,
      recentActivities: activitiesData.slice(0, 15),
      dailyOrderVolume,
      topSalestoday,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= Alerts API =============
router.get('/alerts', authenticateToken, authorizeRoles('owner', 'stock'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const now = new Date();
    const expiryBefore = new Date(now.getTime() + Number(days) * 24 * 60 * 60 * 1000);
    
    // ดึง cancelled order batches data
    const { cancelledOrderIds, cancelledBatchRefs } = await getCancelledBatchRefs();
    
    // ⚠️ ไม่ใช้ .lean() เพื่อให้ virtual field (stockOnHand) ถูกคำนวณ
    const products = await Product.find({ status: 'active' });
    
    const lowStockAlerts = [];
    const outOfStockAlerts = [];
    const nearExpiryAlerts = [];
    
    for (const product of products) {
      // ⛔ ข้ามสินค้าที่ปิดการแจ้งเตือน
      if (!product.enableStockAlerts) continue;
      
      for (const variant of product.variants || []) {
        if (variant.status !== 'active') continue;
        const stock = variant.stockOnHand || 0;
        const rawReorderPoint = variant.reorderPoint || 0;
        const leadTimeDays = product.leadTimeDays || 7; // Get from product level
        const bufferDays = product.reorderBufferDays ?? 7;

        // ✅ คำนวณยอดขาย ใช้ leadTimeDays + bufferDays (ตรงกับ stockAlertService)
        const salesPeriodDays = leadTimeDays + bufferDays;
        const salesSince = new Date(now.getTime() - salesPeriodDays * 24 * 60 * 60 * 1000);
        
        // ดึงยอดขายตามช่วงเวลา leadTime + bufferDays
        const variantSalesData = await InventoryOrder.aggregate([
          { $match: { type: 'sale', orderDate: { $gte: salesSince }, status: { $ne: 'cancelled' } } },
          { $unwind: '$items' },
          {
            $match: {
              'items.variantId': variant._id,
            },
          },
          {
            $group: {
              _id: null,
              totalSold: { $sum: '$items.quantity' },
            },
          },
        ]);
        
        const quantitySold = variantSalesData[0]?.totalSold || 0;
        const dailySalesRate = quantitySold / salesPeriodDays;

        // ใช้ calculateReorderMetrics สำหรับความสอดคล้องกับ stockAlertService
        const reorderMetrics = calculateReorderMetrics(dailySalesRate, leadTimeDays, bufferDays);
        const computedReorderPoint = Math.ceil(reorderMetrics.suggestedReorderPoint);
        const suggestedOrderQty = Math.ceil(reorderMetrics.suggestedReorderQty);
        const suggestedOrder = Math.max(0, suggestedOrderQty - stock);
        
        // ใช้ค่าที่ user กำหนด หากไม่มี ให้ใช้ค่าที่คำนวณ
        const reorderPoint = rawReorderPoint || computedReorderPoint;

        // คำนวณวันที่สต็อกจะหมด
        const daysUntilStockOut = dailySalesRate > 0 ? stock / dailySalesRate : 999;
        const minimumDays = leadTimeDays + bufferDays;

        // Out of stock
        if (stock <= 0) {
          outOfStockAlerts.push({
            type: 'out-of-stock',
            severity: 'critical',
            productId: product._id,
            productName: product.name,
            variantId: variant._id,
            sku: variant.sku,
            stockOnHand: stock,
            reorderPoint,
            suggestedReorderPoint: computedReorderPoint,
            suggestedOrder,
            avgDailySales: dailySalesRate,
            daysOfStock: Math.floor(stock / (dailySalesRate || 0.1)),
            dailySalesRate: Math.round(dailySalesRate * 100) / 100,
            daysUntilStockOut: 0,
            message: `${product.name} (${variant.sku}) หมดสต็อก`,
          });
        }
        // Low stock - ใช้ทั้ง reorderPoint และ การคำนวณจาก daily sales
        else if (stock <= reorderPoint || (dailySalesRate > 0 && daysUntilStockOut < minimumDays)) {
          const severity = daysUntilStockOut <= 7 ? 'critical' : 'warning';
          lowStockAlerts.push({
            type: 'low-stock',
            severity,
            productId: product._id,
            productName: product.name,
            variantId: variant._id,
            sku: variant.sku,
            stockOnHand: stock,
            reorderPoint,
            suggestedReorderPoint: computedReorderPoint,
            suggestedOrder,
            avgDailySales: dailySalesRate,
            daysOfStock: Math.floor(stock / (dailySalesRate || 0.1)),
            dailySalesRate: Math.round(dailySalesRate * 100) / 100,
            daysUntilStockOut: Math.round(daysUntilStockOut * 10) / 10,
            leadTimeDays,
            message: `${product.name} (${variant.sku}) สต็อกต่ำ: ${stock} ชิ้น (เหลือ ${Math.round(daysUntilStockOut)} วัน)`,
          });
        }

        // Near expiry batches - ข้าม batches ที่เกี่ยวข้องกับ cancelled orders
        for (const batch of variant.batches || []) {
          // ข้าม batches ที่มาจาก cancelled orders
          if (isBatchFromCancelledOrder(batch, cancelledOrderIds, cancelledBatchRefs)) {
            continue;
          }
          
          if (batch.expiryDate && new Date(batch.expiryDate) <= expiryBefore && new Date(batch.expiryDate) >= now) {
            const daysLeft = Math.ceil((new Date(batch.expiryDate) - now) / (1000 * 60 * 60 * 24));
            nearExpiryAlerts.push({
              type: 'near-expiry',
              severity: daysLeft <= 7 ? 'critical' : 'warning',
              productId: product._id,
              productName: product.name,
              variantId: variant._id,
              sku: variant.sku,
              batchRef: batch.batchRef,
              expiryDate: batch.expiryDate,
              quantity: batch.quantity,
              daysLeft,
              message: `${product.name} (${variant.sku}) ล็อต ${batch.batchRef || 'N/A'} หมดอายุใน ${daysLeft} วัน`,
            });
          }
        }
      }
    }
    
    // Sort by severity
    const allAlerts = [
      ...outOfStockAlerts,
      ...nearExpiryAlerts.sort((a, b) => a.daysLeft - b.daysLeft),
      ...lowStockAlerts.sort((a, b) => a.daysUntilStockOut - b.daysUntilStockOut),
    ];
    
    res.json({
      alerts: allAlerts,
      counts: {
        total: allAlerts.length,
        critical: allAlerts.filter((a) => a.severity === 'critical').length,
        warning: allAlerts.filter((a) => a.severity === 'warning').length,
        outOfStock: outOfStockAlerts.length,
        lowStock: lowStockAlerts.length,
        nearExpiry: nearExpiryAlerts.length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= Debug Endpoint: Cost Calculation Details =============
router.get('/debug/cost-details', authenticateToken, authorizeRoles('owner', 'stock'), async (req, res) => {
  try {
    // ⚠️ ไม่ใช้ .lean() เพื่อให้ virtual field (stockOnHand) ถูกคำนวณ
    const products = await Product.find({ status: 'active' });
    
    const costDetails = [];
    
    products.forEach((product) => {
      (product.variants || []).forEach((variant) => {
        const stock = variant.stockOnHand || 0;
        if (stock === 0) return; // ข้ามสินค้าที่หมดสต็อก
        
        const costingMethod = product.costingMethod || 'FIFO';
        const calculatedValue = calculateInventoryValue(variant, costingMethod);
        
        const batchDetails = (variant.batches || []).map(b => ({
          ref: b.batchRef || 'N/A',
          qty: b.quantity || 0,
          cost: b.cost || 0,
          totalValue: (b.quantity || 0) * (b.cost || 0),
          received: b.receivedAt ? new Date(b.receivedAt).toISOString().split('T')[0] : 'N/A'
        }));
        
        const totalBatchQty = batchDetails.reduce((sum, b) => sum + b.qty, 0);
        const totalBatchValue = batchDetails.reduce((sum, b) => sum + b.totalValue, 0);
        
        costDetails.push({
          productName: product.name,
          sku: variant.sku,
          costingMethod,
          stockOnHand: stock,
          batches: batchDetails,
          batchStats: {
            count: batchDetails.length,
            totalQty: totalBatchQty,
            totalValueAllBatches: totalBatchValue,
            avgCostPerUnit: totalBatchQty > 0 ? (totalBatchValue / totalBatchQty).toFixed(2) : 0
          },
          calculatedValue: calculatedValue.toFixed(2),
          status: batchDetails.length === 0 ? 'WARNING: No batches' : 'OK'
        });
      });
    });
    
    res.json({
      totalItems: costDetails.length,
      details: costDetails
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= Public Debug Endpoint (No Auth): Cost Calculation Details =============
router.get('/debug/cost-details-public', async (req, res) => {
  try {
    // ✅ ดึงทุก product ไม่ว่า status เป็นไร
    // ⚠️ ไม่ใช้ .lean() เพื่อให้ virtual field (stockOnHand) ถูกคำนวณ
    const products = await Product.find({});
    
    const costDetails = [];
    let totalActiveVariants = 0;
    let variantsWithStock = 0;
    let variantsWithBatches = 0;
    
    products.forEach((product) => {
      (product.variants || []).forEach((variant) => {
        totalActiveVariants++;
        const stock = variant.stockOnHand || 0;
        const hasBatches = (variant.batches && variant.batches.length > 0);
        
        if (stock > 0) variantsWithStock++;
        if (hasBatches) variantsWithBatches++;
        
        const costingMethod = product.costingMethod || 'FIFO';
        const calculatedValue = calculateInventoryValue(variant, costingMethod);
        
        const batchDetails = (variant.batches || []).map(b => ({
          ref: b.batchRef || 'N/A',
          qty: b.quantity || 0,
          cost: b.cost || 0,
          totalValue: (b.quantity || 0) * (b.cost || 0),
          received: b.receivedAt ? new Date(b.receivedAt).toISOString().split('T')[0] : 'N/A'
        }));
        
        const totalBatchQty = batchDetails.reduce((sum, b) => sum + b.qty, 0);
        const totalBatchValue = batchDetails.reduce((sum, b) => sum + b.totalValue, 0);
        
        costDetails.push({
          productName: product.name,
          productId: product._id,
          productStatus: product.status,
          sku: variant.sku,
          variantStatus: variant.status,
          costingMethod,
          stockOnHand: stock,
          batches: batchDetails,
          batchStats: {
            count: batchDetails.length,
            totalQty: totalBatchQty,
            totalValueAllBatches: totalBatchValue,
            avgCostPerUnit: totalBatchQty > 0 ? (totalBatchValue / totalBatchQty).toFixed(2) : 0
          },
          calculatedValue: calculatedValue.toFixed(2),
          status: batchDetails.length === 0 ? 'NO_BATCHES' : (stock === 0 ? 'ZERO_STOCK' : 'OK')
        });
      });
    });
    
    res.json({
      summary: {
        totalProducts: products.length,
        totalActiveVariants,
        variantsWithStock,
        variantsWithBatches,
        variantsWithCalculatedValue: costDetails.filter(d => d.calculatedValue > 0).length
      },
      totalItems: costDetails.length,
      details: costDetails.sort((a, b) => b.calculatedValue - a.calculatedValue)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

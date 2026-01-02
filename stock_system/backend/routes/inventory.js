import express from 'express';
import Product from '../models/Product.js';
import InventoryOrder from '../models/InventoryOrder.js';
import StockMovement from '../models/StockMovement.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { recordMovement } from './movements.js';
import { checkAndAlertAfterSale } from '../services/stockAlertService.js';
import { calculateSuggestedReorderPoint } from '../services/stockAlertService.js';

const router = express.Router();

const selectVariant = (product, variantId, sku) => {
  if (!product?.variants) return null;
  if (variantId) {
    const variant = product.variants.id(variantId);
    if (variant) return variant;
  }
  if (sku) return product.variants.find((variant) => variant.sku === sku);
  return product.variants[0] || null;
};

const consumeBatches = (variant, quantity) => {
  // If no batch tracking, treat as fully consumable
  if (!variant.batches || variant.batches.length === 0) return 0;

  let remaining = quantity;
  const sorted = [...(variant.batches || [])].sort((a, b) => {
    const aDate = a.expiryDate ? new Date(a.expiryDate) : new Date(8640000000000000);
    const bDate = b.expiryDate ? new Date(b.expiryDate) : new Date(8640000000000000);
    return aDate - bDate;
  });

  const updated = [];
  for (const batch of sorted) {
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

  variant.batches = updated.filter((batch) => (batch.quantity || 0) > 0);
  return remaining;
};

const applyStockChange = (variant, item, type) => {
  const qty = Number(item.quantity) || 0;
  if (qty <= 0) throw new Error('Quantity must be greater than zero');

  if (type === 'purchase') {
    variant.stockOnHand = (variant.stockOnHand || 0) + qty;
    variant.incoming = Math.max(0, (variant.incoming || 0) - qty);
    if (item.expiryDate || item.batchRef || item.cost || item.supplier) {
      variant.batches.push({
        batchRef: item.batchRef,
        supplier: item.supplier,
        cost: item.cost,
        quantity: qty,
        expiryDate: item.expiryDate,
        receivedAt: item.receivedAt,
      });
    }
    return;
  }

  if (type === 'sale') {
    if (!variant.allowBackorder && (variant.stockOnHand || 0) < qty) {
      throw new Error(`Insufficient stock for SKU ${variant.sku}`);
    }

    // ลด stockOnHand ก่อน
    variant.stockOnHand = (variant.stockOnHand || 0) - qty;

    // ถ้ามี batches ให้ consume ตาม FIFO (First Expire, First Out)
    if (variant.batches && variant.batches.length > 0) {
      const snapshot = {
        stockOnHand: variant.stockOnHand + qty, // เก็บค่าเดิมก่อนลด
        batches: variant.batches.map((batch) => (batch.toObject ? batch.toObject() : { ...batch })),
      };

      const remaining = consumeBatches(variant, qty);

      // ถ้า consume batches ไม่พอและไม่อนุญาต backorder ให้ rollback
      if (remaining > 0 && !variant.allowBackorder) {
        variant.stockOnHand = snapshot.stockOnHand;
        variant.batches = snapshot.batches;
        throw new Error(`Insufficient batch quantities for SKU ${variant.sku}`);
      }
    }
    // ถ้าไม่มี batches tracking ก็แค่ลด stockOnHand อย่างเดียว (ทำไปแล้วด้านบน)
    return;
  }

  if (type === 'adjustment') {
    variant.stockOnHand = (variant.stockOnHand || 0) + qty;
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

    for (const rawItem of items) {
      const product = await Product.findById(rawItem.productId);
      if (!product) return res.status(404).json({ error: `Product ${rawItem.productId} not found` });

      const variant = selectVariant(product, rawItem.variantId, rawItem.sku);
      if (!variant) return res.status(404).json({ error: 'Variant not found on the product' });

      const unitPrice = rawItem.unitPrice ?? variant.price ?? 0;
      const qty = Number(rawItem.quantity) || 0;
      const previousStock = variant.stockOnHand || 0;

      if (type === 'purchase') {
        // สำหรับใบสั่งซื้อ: เพิ่ม incoming ไว้ก่อน รอรับของจึงบวกสต็อกจริง
        variant.incoming = (variant.incoming || 0) + qty;
      } else {
        applyStockChange(variant, { ...rawItem, quantity: qty }, type);
        
        // เก็บข้อมูลสำหรับ movement (ยกเว้น purchase เพราะยังไม่รับของ)
        movementRecords.push({
          movementType: type === 'sale' ? 'out' : 'adjust',
          product,
          variant,
          quantity: type === 'sale' ? -qty : qty,
          previousStock,
          newStock: variant.stockOnHand,
          reference,
          batchRef: rawItem.batchRef,
          expiryDate: rawItem.expiryDate,
          unitCost: variant.cost || 0,
        });
      }

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

      await product.save();
    }

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
      variant.stockOnHand = (variant.stockOnHand || 0) + delta;
      variant.incoming = Math.max(0, (variant.incoming || 0) - delta);
      item.receivedQuantity = newReceived;
      
      // อัพเดท cost ของ variant จาก unitPrice (ถ้ามี)
      if (item.unitPrice && item.unitPrice > 0) {
        variant.cost = item.unitPrice;
      }

      // สร้างเลขล็อตอัตโนมัติ (ถ้าไม่ได้ระบุ)
      const generateBatchRef = () => {
        const now = new Date();
        const dateStr = now.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
        const timeStr = now.toISOString().slice(11, 16).replace(':', ''); // HHMM
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `LOT${dateStr}-${timeStr}-${random}`;
      };

      // เพิ่ม batch เมื่อรับของ ถ้ามีข้อมูล batchRef, expiryDate, หรือ unitPrice
      if (item.batchRef || item.expiryDate || item.unitPrice) {
        variant.batches.push({
          batchRef: item.batchRef || generateBatchRef(),
          cost: item.unitPrice || 0,
          quantity: delta,
          expiryDate: item.expiryDate,
          receivedAt: new Date(),
        });
      }
      
      // เก็บข้อมูลสำหรับ movement
      movementRecords.push({
        movementType: 'in',
        product,
        variant,
        quantity: delta,
        previousStock,
        newStock: variant.stockOnHand,
        reference: order.reference,
        batchRef: item.batchRef,
        expiryDate: item.expiryDate,
        unitCost: item.unitPrice || variant.cost || 0,
      });
    }

    // Save all products
    for (const p of productCache.values()) {
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
        // Rollback: ลด incoming ที่ยังไม่รับ และลด stockOnHand ที่รับแล้ว
        const pendingQty = qty - receivedQty;
        variant.incoming = Math.max(0, (variant.incoming || 0) - pendingQty);
        variant.stockOnHand = Math.max(0, (variant.stockOnHand || 0) - receivedQty);
        // Note: ไม่ลบ batches เพราะอาจถูก consume ไปแล้ว
      } else if (order.type === 'sale') {
        // Rollback: คืน stock กลับ
        variant.stockOnHand = (variant.stockOnHand || 0) + qty;
      } else if (order.type === 'adjustment') {
        // Rollback: ลบจำนวนที่ปรับไป
        variant.stockOnHand = (variant.stockOnHand || 0) - qty;
      }
    }

    // Save all products
    for (const p of productCache.values()) {
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
      InventoryOrder.find(match).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
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
    const days = Number(req.query.days) || 30;
    const expiryDays = Number(req.query.expiryDays) || 30;
    const top = Math.min(50, Math.max(1, Number(req.query.top) || 10));
    const salesSince = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const expiryBefore = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000);

    // คำนวณยอดขายใน 30 วันที่ผ่านมา (ใช้ orderDate แทน createdAt เพื่อความถูกต้อง)
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
    const products = await Product.find().lean();
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

    products.forEach((product) => {
      (product.variants || []).forEach((variant) => {
        const key = `${product._id}-${variant._id}`;
        const quantitySold = salesMap.get(key) || 0;
        const dailySalesRate = quantitySold / days; // ขายเฉลี่ยต่อวัน
        const incoming = variant.incoming || 0;
        const currentStock = (variant.stockOnHand || 0) + incoming; // รวมของที่สั่งแล้วยังไม่รับ
        const leadTimeDays = variant.leadTimeDays || 7; // default 7 วัน

        // คำนวณว่าสต็อกปัจจุบันพอใช้กี่วัน
        const daysUntilStockOut = dailySalesRate > 0 ? currentStock / dailySalesRate : 999999;

        // บันทึก fast movers รายละเอียด
        if (dailySalesRate > 0) {
          const daysUntilStockOutFM = dailySalesRate > 0 ? (currentStock / dailySalesRate) : 999999;
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
            daysRemaining: Math.round(daysUntilStockOutFM * 10) / 10,
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
        const bufferDays = 7; // default buffer 7 วัน
        const minimumDays = leadTimeDays + bufferDays;

        if (daysUntilStockOut < minimumDays) {
          // คำนวณจำนวนที่ควรสั่ง (เพียงพอสำหรับ lead time + buffer)
          const daysToOrder = minimumDays; // สั่งให้พอใช้ lead time + buffer
          const minCoverQty = Math.ceil(Math.max(0, dailySalesRate * minimumDays - currentStock));
          const recommendedOrderQty = Math.ceil(dailySalesRate * daysToOrder - currentStock);

          if (recommendedOrderQty > 0) {
            reorderSuggestions.push({
              productId: product._id,
              productName: product.name,
              variantId: variant._id,
              sku: variant.sku,
              currentStock,
              incoming,
              quantitySold,
              dailySalesRate: Math.round(dailySalesRate * 100) / 100,
              daysUntilStockOut: Math.round(daysUntilStockOut * 10) / 10,
              recommendedOrderQty,
              leadTimeDays,
              minOrderQty: minCoverQty,
              bufferDays,
            });

            lowStock.push({
              productId: product._id,
              productName: product.name,
              variantId: variant._id,
              sku: variant.sku,
              stockOnHand: currentStock,
              leadTimeDays,
              daysRemaining: Math.round(daysUntilStockOut * 10) / 10,
            });
          }
        }
      });
    });

    // เรียงตามความเร่งด่วน (วันที่เหลือน้อยที่สุด)
    reorderSuggestions.sort((a, b) => a.daysUntilStockOut - b.daysUntilStockOut);
    lowStock.sort((a, b) => a.daysRemaining - b.daysRemaining);

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
          expiryDate: '$variants.batches.expiryDate',
          quantity: '$variants.batches.quantity',
        },
      },
      { $sort: { expiryDate: 1 } },
    ]);

    const fastMovers = fastMoversDetailed.sort((a, b) => b.quantitySold - a.quantitySold).slice(0, top);

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
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, top);
    const brandSummaries = Array.from(groupByBrand.values())
      .map((c) => ({
        brandId: c.brandId,
        brandName: c.brandName,
        totalSold: c.totalSold,
        totalStock: c.totalStock,
        dailySalesRate: Math.round(c.dailySalesRate * 100) / 100,
        daysRemaining: c.dailySalesRate > 0 ? Math.round((c.totalStock / c.dailySalesRate) * 10) / 10 : 999999,
      }))
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, top);

    res.json({
      lowStock,
      nearExpiry,
      fastMovers,
      reorderSuggestions,
      categorySummaries,
      brandSummaries,
      meta: {
        days,
        top,
        counts: {
          lowStock: lowStock.length,
          nearExpiry: nearExpiry.length,
          fastMovers: fastMovers.length,
          reorderSuggestions: reorderSuggestions.length,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= Dashboard Summary =============
router.get('/dashboard', authenticateToken, authorizeRoles('owner', 'stock'), async (_req, res) => {
  try {
    const products = await Product.find({ status: 'active' }).lean();
    
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
        const cost = variant.cost || 0;
        const reorderPoint = variant.reorderPoint || 0;
        
        totalStock += stock;
        totalValue += stock * cost;
        
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
        categoryStock[catName].value += stock * cost;
        categoryStock[catName].count++;
        
        // Group by brand (lookup name from map)
        const brandId = product.brand || '';
        const brandName = brandMap[brandId] || 'ไม่ระบุ';
        if (!brandStock[brandName]) brandStock[brandName] = { stock: 0, value: 0, count: 0 };
        brandStock[brandName].stock += stock;
        brandStock[brandName].value += stock * cost;
        brandStock[brandName].count++;
      });
    });
    
    // วันนี้มี orders กี่รายการ
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ordersToday = await InventoryOrder.countDocuments({ createdAt: { $gte: today } });
    const pendingOrders = await InventoryOrder.countDocuments({ status: 'pending' });
    
    // Movement summary (7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
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
    const now = new Date();
    const expiryBefore = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    let nearExpiryCount = 0;
    
    products.forEach((product) => {
      (product.variants || []).forEach((variant) => {
        (variant.batches || []).forEach((batch) => {
          if (batch.expiryDate && new Date(batch.expiryDate) <= expiryBefore && new Date(batch.expiryDate) >= now) {
            nearExpiryCount++;
          }
        });
      });
    });
    
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
    
    // ดึงยอดขาย 30 วันย้อนหลังจาก InventoryOrder (เหมือน Insights API)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const salesData = await InventoryOrder.aggregate([
      { $match: { type: 'sale', orderDate: { $gte: thirtyDaysAgo }, status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: { variantId: '$items.variantId' },
          quantitySold: { $sum: '$items.quantity' },
        },
      },
    ]);
    
    // สร้าง map ของยอดขายต่อ variant
    const salesByVariant = new Map();
    salesData.forEach((s) => {
      const key = String(s._id.variantId);
      salesByVariant.set(key, s.quantitySold || 0);
    });
    
    const products = await Product.find({ status: 'active' }).lean();
    
    const lowStockAlerts = [];
    const outOfStockAlerts = [];
    const nearExpiryAlerts = [];
    
    for (const product of products) {
      for (const variant of product.variants || []) {
        if (variant.status !== 'active') continue;
        const stock = variant.stockOnHand || 0;
        const rawReorderPoint = variant.reorderPoint || 0;
        const leadTimeDays = variant.leadTimeDays || 7; // default 7 วัน
        const bufferDays = 7; // default buffer 7 วัน

        // คำนวณ daily sales rate
        const variantKey = String(variant._id);
        const quantitySold = salesByVariant.get(variantKey) || 0;
        const dailySalesRate = quantitySold / 30;

        // ถ้า reorderPoint ยังเป็น 0 ให้คำนวณค่าแนะนำจาก service
        let reorderPoint = rawReorderPoint;
        if (!reorderPoint || reorderPoint === 0) {
          try {
            const suggested = await calculateSuggestedReorderPoint(variant._id, leadTimeDays, bufferDays);
            reorderPoint = Math.max(0, Math.round(suggested?.suggestedReorderPoint || 0));
          } catch (err) {
            reorderPoint = 0;
          }
        }

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
            dailySalesRate: Math.round(dailySalesRate * 100) / 100,
            daysUntilStockOut: Math.round(daysUntilStockOut * 10) / 10,
            leadTimeDays,
            message: `${product.name} (${variant.sku}) สต็อกต่ำ: ${stock} ชิ้น (เหลือ ${Math.round(daysUntilStockOut)} วัน)`,
          });
        }

        // Near expiry batches
        for (const batch of variant.batches || []) {
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

export default router;

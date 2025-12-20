import express from 'express';
import Product from '../models/Product.js';
import InventoryOrder from '../models/InventoryOrder.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

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

    const snapshot = {
      stockOnHand: variant.stockOnHand,
      batches: (variant.batches || []).map((batch) => (batch.toObject ? batch.toObject() : { ...batch })),
    };

    variant.stockOnHand = (variant.stockOnHand || 0) - qty;
    const remaining = consumeBatches(variant, qty);

    if (remaining > 0 && !variant.allowBackorder) {
      variant.stockOnHand = snapshot.stockOnHand;
      variant.batches = snapshot.batches;
      throw new Error(`Insufficient batch quantities for SKU ${variant.sku}`);
    }
    return;
  }

  if (type === 'adjustment') {
    variant.stockOnHand = (variant.stockOnHand || 0) + qty;
    return;
  }

  throw new Error('Unsupported order type');
};

router.post('/orders', authenticateToken, authorizeRoles('owner', 'admin', 'hr'), async (req, res) => {
  try {
    const { type, items, reference, channel, notes, totals } = req.body || {};

    if (!type) return res.status(400).json({ error: 'Order type is required' });
    if (!items || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });

    const orderItems = [];

    for (const rawItem of items) {
      const product = await Product.findById(rawItem.productId);
      if (!product) return res.status(404).json({ error: `Product ${rawItem.productId} not found` });

      const variant = selectVariant(product, rawItem.variantId, rawItem.sku);
      if (!variant) return res.status(404).json({ error: 'Variant not found on the product' });

      const unitPrice = rawItem.unitPrice ?? variant.price ?? 0;
      const qty = Number(rawItem.quantity) || 0;

      if (type === 'purchase') {
        // สำหรับใบสั่งซื้อ: เพิ่ม incoming ไว้ก่อน รอรับของจึงบวกสต็อกจริง
        variant.incoming = (variant.incoming || 0) + qty;
      } else {
        applyStockChange(variant, { ...rawItem, quantity: qty }, type);
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
      reference,
      channel,
      notes,
      totals,
      placedBy: req.user?._id,
      items: orderItems,
    });

    await order.save();
    res.status(201).json(order);
  } catch (error) {
    const lowered = (error.message || '').toLowerCase();
    const isClientError = ['insufficient', 'quantity must'].some((phrase) => lowered.includes(phrase));
    res.status(isClientError ? 400 : 500).json({ error: error.message });
  }
});

// รับของสำหรับใบสั่งซื้อ
router.patch('/orders/:id/receive', authenticateToken, authorizeRoles('owner', 'admin', 'hr'), async (req, res) => {
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

      variant.stockOnHand = (variant.stockOnHand || 0) + delta;
      variant.incoming = Math.max(0, (variant.incoming || 0) - delta);
      item.receivedQuantity = newReceived;
    }

    // Save all products
    for (const p of productCache.values()) {
      await p.save();
    }

    // Update order status
    const allReceived = order.items.every((it) => (it.receivedQuantity || 0) >= (it.quantity || 0));
    order.status = allReceived ? 'completed' : 'pending';
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

router.get('/insights', authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    const days = Number(req.query.days) || 30;
    const expiryDays = Number(req.query.expiryDays) || 30;
    const top = Math.min(50, Math.max(1, Number(req.query.top) || 10));
    const salesSince = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const expiryBefore = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000);

    // คำนวณยอดขายใน 30 วันที่ผ่านมา
    const salesData = await InventoryOrder.aggregate([
      { $match: { type: 'sale', createdAt: { $gte: salesSince }, status: { $ne: 'cancelled' } } },
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
        const leadTimeDays = variant.leadTimeDays || 0;

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
        const bufferDays = 7; // buffer 7 วัน
        const minimumDays = leadTimeDays + bufferDays;

        if (daysUntilStockOut < minimumDays) {
          // คำนวณจำนวนที่ควรสั่ง
          const daysToOrder = leadTimeDays + bufferDays + 30; // สั่งให้พอใช้ lead time + buffer + 30 วัน
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

export default router;

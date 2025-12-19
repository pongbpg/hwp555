import express from 'express';
import Product from '../models/Product.js';
import InventoryOrder from '../models/InventoryOrder.js';
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

      applyStockChange(variant, rawItem, type);

      const unitPrice = rawItem.unitPrice ?? variant.price ?? 0;

      orderItems.push({
        productId: product._id,
        productName: product.name,
        variantId: variant._id,
        sku: variant.sku,
        quantity: Number(rawItem.quantity) || 0,
        unitPrice,
        batchRef: rawItem.batchRef,
        expiryDate: rawItem.expiryDate,
        notes: rawItem.notes,
      });

      await product.save();
    }

    const order = new InventoryOrder({
      type,
      status: req.body.status || 'completed',
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

router.get('/insights', authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    const days = Number(req.query.days) || 30;
    const expiryDays = Number(req.query.expiryDays) || 30;
    const salesSince = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const expiryBefore = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000);

    const lowStock = await Product.aggregate([
      { $unwind: '$variants' },
      { $match: { $expr: { $lte: ['$variants.stockOnHand', '$variants.reorderPoint'] } } },
      {
        $project: {
          productId: '$_id',
          productName: '$name',
          variantId: '$variants._id',
          sku: '$variants.sku',
          stockOnHand: '$variants.stockOnHand',
          reorderPoint: '$variants.reorderPoint',
          reorderQty: '$variants.reorderQty',
          leadTimeDays: '$variants.leadTimeDays',
        },
      },
    ]);

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

    const fastMovers = await InventoryOrder.aggregate([
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
      { $sort: { quantitySold: -1 } },
      { $limit: 10 },
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

    const reorderSuggestions = lowStock.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      variantId: item.variantId,
      sku: item.sku,
      recommendedOrderQty: Math.max(item.reorderQty || 0, (item.reorderPoint || 0) - (item.stockOnHand || 0)),
      leadTimeDays: item.leadTimeDays,
    }));

    res.json({ lowStock, nearExpiry, fastMovers, reorderSuggestions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

import express from 'express';
import Product from '../models/Product.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

const buildFilters = (query) => {
  const filters = {};
  if (query.status) filters.status = query.status;
  if (query.category) filters.category = query.category;
  if (query.q) {
    filters.$or = [
      { name: { $regex: query.q, $options: 'i' } },
      { sku: { $regex: query.q, $options: 'i' } },
      { brand: { $regex: query.q, $options: 'i' } },
      { tags: { $in: [query.q] } },
    ];
  }
  return filters;
};

router.get('/', authenticateToken, async (req, res) => {
  try {
    const filters = buildFilters(req.query);
    const products = await Product.find(filters).lean();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, authorizeRoles('owner', 'admin', 'hr'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.variants || body.variants.length === 0) {
      return res.status(400).json({ error: 'At least one variant is required' });
    }

    const product = new Product({ ...body, createdBy: req.user?._id, updatedBy: req.user?._id });
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticateToken, authorizeRoles('owner', 'admin', 'hr'), async (req, res) => {
  try {
    const updatableFields = [
      'name',
      'sku',
      'description',
      'category',
      'brand',
      'unit',
      'tags',
      'status',
      'attributesSchema',
      'variants',
      'skuPrefix',
      'costingMethod',
      'leadTimeDays',
      'reorderBufferDays',
      'minOrderQty',
    ];

    const updatePayload = { updatedBy: req.user?._id };
    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) updatePayload[field] = req.body[field];
    });

    const product = await Product.findByIdAndUpdate(req.params.id, updatePayload, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

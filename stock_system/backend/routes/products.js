import express from 'express';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// Helper: Generate SKU based on new formula
// Formula: {Brand} - {Category} - {Model} - {Color} - {Size} - {Material}
const generateSKUFromVariant = async (product, variant) => {
  // Get brand name
  const brandDoc = await Brand.findById(product.brand);
  const brandName = brandDoc?.name || 'UNKNOWN';
  
  // Get category name
  const categoryDoc = await Category.findById(product.category);
  const categoryName = categoryDoc?.name || 'UNKNOWN';
  
  // Collect parts
  const parts = [
    brandName,
    categoryName,
    variant.model,
    variant.attributes?.color || variant.color,
    variant.attributes?.size || variant.size,
    variant.attributes?.material || variant.material,
  ].filter(Boolean); // Remove empty parts
  
  // Join with ` - ` separator and convert to uppercase
  return parts.join(' - ').toUpperCase();
};

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

    // Auto-generate SKU for each variant if not provided
    const variantsWithSKU = await Promise.all(
      body.variants.map(async (variant) => {
        if (!variant.sku) {
          // Create temporary product object to generate SKU
          const tempProduct = { brand: body.brand, category: body.category };
          variant.sku = await generateSKUFromVariant(tempProduct, variant);
        }
        return variant;
      })
    );

    const product = new Product({ 
      ...body, 
      variants: variantsWithSKU,
      createdBy: req.user?._id, 
      updatedBy: req.user?._id 
    });
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
      'enableStockAlerts',
      'attributesSchema',
      'variants',
      'skuProduct',
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

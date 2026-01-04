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
    const products = await Product.find(filters);  // ✅ ลบ .lean() เพื่อให้ virtual field (stockOnHand) ทำงาน
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);  // ✅ ลบ .lean() เพื่อให้ virtual field (stockOnHand) ทำงาน
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
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // ✅ CRITICAL: Merge variants with proper batch preservation
    // Strategy: Build NEW variant array by matching old variants with new data
    if (req.body.variants && Array.isArray(req.body.variants)) {
      const newVariants = [];
      
      for (const newVariant of req.body.variants) {
        if (newVariant._id) {
          // OLD VARIANT: Find by _id and preserve batches + other fields
          const oldVariantIdx = product.variants.findIndex(v => String(v._id) === String(newVariant._id));
          
          if (oldVariantIdx !== -1) {
            // Found old variant - merge data carefully
            const oldVariant = product.variants[oldVariantIdx];
            
            // Create merged variant object
            const mergedVariant = {
              _id: oldVariant._id,  // ✅ Keep original _id
              sku: newVariant.sku || oldVariant.sku,
              name: newVariant.name || oldVariant.name,
              barcode: newVariant.barcode || oldVariant.barcode,
              model: newVariant.model !== undefined ? newVariant.model : oldVariant.model,
              attributes: newVariant.attributes || oldVariant.attributes || {},
              price: newVariant.price !== undefined ? newVariant.price : oldVariant.price,
              committed: newVariant.committed !== undefined ? newVariant.committed : oldVariant.committed,
              incoming: newVariant.incoming !== undefined ? newVariant.incoming : oldVariant.incoming,
              reorderPoint: newVariant.reorderPoint !== undefined ? newVariant.reorderPoint : oldVariant.reorderPoint,
              reorderQty: newVariant.reorderQty !== undefined ? newVariant.reorderQty : oldVariant.reorderQty,
              allowBackorder: newVariant.allowBackorder !== undefined ? newVariant.allowBackorder : oldVariant.allowBackorder,
              status: newVariant.status || oldVariant.status || 'active',
              // ✅ CRITICAL: Always preserve batches from old variant
              batches: (newVariant.batches && newVariant.batches.length > 0) 
                ? newVariant.batches 
                : (oldVariant.batches || []),
            };
            
            newVariants.push(mergedVariant);
          } else {
            // Old variant not found - treat as new
            newVariants.push(newVariant);
          }
        } else {
          // NEW VARIANT: No _id means it's a new variant
          newVariants.push(newVariant);
        }
      }
      
      // ✅ Replace entire variants array with merged variants
      product.variants = newVariants;
    }

    // Update other product fields (NOT variants - already handled above)
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
      'skuProduct',
      'costingMethod',
      'leadTimeDays',
      'reorderBufferDays',
      'minOrderQty',
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        product[field] = req.body[field];
      }
    });
    
    product.updatedBy = req.user?._id;

    // ✅ Use product.save() to ensure Mongoose handles subdocuments correctly
    await product.save();

    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

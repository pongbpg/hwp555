import express from 'express';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import StockMovement from '../models/StockMovement.js';
import InventoryOrder from '../models/InventoryOrder.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// ดึงค่า attribute จาก variant (รองรับทั้ง Mongoose Map และ plain object)
const getAttr = (variant, key) => {
  const attrs = variant?.attributes;
  if (!attrs) return variant?.[key];
  const val = attrs.get ? attrs.get(key) : attrs[key];
  return val ?? variant?.[key];
};

// โหลด prefix ของ brand + category ครั้งเดียวต่อ request
const loadPrefixes = async (brandId, categoryId) => {
  const [brandDoc, categoryDoc] = await Promise.all([
    brandId ? Brand.findById(brandId) : null,
    categoryId ? Category.findById(categoryId) : null,
  ]);
  return { brandPrefix: brandDoc?.prefix || '', categoryPrefix: categoryDoc?.prefix || '' };
};

// Helper: สร้าง SKU จากสูตรมาตรฐาน (ตรงกับ frontend generateVariantSKU)
// Formula: brand.prefix - category.prefix - product.skuProduct - model - color - size - material
const buildVariantSku = (brandPrefix, categoryPrefix, skuProduct, variant) => {
  const parts = [
    brandPrefix,
    categoryPrefix,
    skuProduct,
    variant.model,
    getAttr(variant, 'color'),
    getAttr(variant, 'size'),
    getAttr(variant, 'material'),
  ].map((s) => (s == null ? '' : String(s).trim())).filter(Boolean);
  return parts.join('-').toUpperCase();
};

// Regenerate SKU ให้แต่ละ variant ตามสูตร (in-place)
// เขียนทับเฉพาะเมื่อสูตรได้ >2 ส่วน (มี identity จริง) — ป้องกันการทับ SKU แบบ running-number ของ single product
const applyGeneratedSkus = (variants, brandPrefix, categoryPrefix, skuProduct) => {
  for (const v of variants) {
    const generated = buildVariantSku(brandPrefix, categoryPrefix, skuProduct, v);
    if (generated && generated.split('-').length > 2) {
      v.sku = generated;
    } else if (!v.sku && generated) {
      v.sku = generated;
    }
  }
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

    // Auto-generate SKU ให้ทุก variant จากสูตรมาตรฐาน (source of truth)
    const { brandPrefix, categoryPrefix } = await loadPrefixes(body.brand, body.category);
    applyGeneratedSkus(body.variants, brandPrefix, categoryPrefix, body.skuProduct || '');

    const product = new Product({
      ...body,
      variants: body.variants,
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

    // เก็บ SKU เดิมของแต่ละ variant (ตาม _id) ไว้เทียบว่ามีการเปลี่ยน เพื่อ cascade ทีหลัง
    const originalSkuByVid = new Map(product.variants.map((v) => [String(v._id), v.sku]));

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
              enableStockAlerts: newVariant.enableStockAlerts !== undefined ? newVariant.enableStockAlerts : oldVariant.enableStockAlerts,
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
      'orderCoverageMultiplier',
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        product[field] = req.body[field];
      }
    });
    
    product.updatedBy = req.user?._id;

    // ✅ Regenerate SKU ให้ทุก variant จากสูตร (ใช้ค่า brand/category/skuProduct ล่าสุด)
    const { brandPrefix, categoryPrefix } = await loadPrefixes(product.brand, product.category);
    applyGeneratedSkus(product.variants, brandPrefix, categoryPrefix, product.skuProduct || '');

    // ✅ Use product.save() to ensure Mongoose handles subdocuments correctly
    await product.save();

    // ✅ Cascade: variant ไหนที่ SKU เปลี่ยนไป → อัปเดตสำเนา sku ใน StockMovement + InventoryOrder
    // (ผูกกันด้วย variantId ไม่ใช่ string sku จึงอัปเดตได้ปลอดภัย)
    const skuChanges = [];
    for (const v of product.variants) {
      const oldSku = originalSkuByVid.get(String(v._id));
      if (oldSku !== undefined && oldSku !== v.sku) {
        skuChanges.push({ variantId: v._id, newSku: v.sku });
      }
    }
    for (const c of skuChanges) {
      await StockMovement.updateMany(
        { variantId: c.variantId, sku: { $ne: c.newSku } },
        { $set: { sku: c.newSku } }
      );
      await InventoryOrder.updateMany(
        { 'items.variantId': c.variantId },
        { $set: { 'items.$[e].sku': c.newSku } },
        { arrayFilters: [{ 'e.variantId': c.variantId, 'e.sku': { $ne: c.newSku } }] }
      );
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

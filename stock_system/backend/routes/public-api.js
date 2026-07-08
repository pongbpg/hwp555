import express from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import { requireApiKey } from '../middleware/apiKey.js';
import { serializeProduct, parseFields } from '../utils/publicSerializer.js';

const router = express.Router();

// escape regex special chars — public endpoint โดนยิงจากใครก็ได้ ต้องกัน ReDoS/injection
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// สร้าง map id→ชื่อ ของ category/brand จากรายการ product (query ครั้งเดียวต่อ request ไม่ใช่ต่อ product)
// product.category/brand เก็บเป็น ObjectId ของคอลเลกชัน Category/Brand — แปลงเป็นชื่อให้ระบบภายนอกอ่านรู้เรื่อง
const buildNameMaps = async (products) => {
  const catIds = new Set();
  const brandIds = new Set();
  for (const p of products) {
    if (p.category && mongoose.isValidObjectId(p.category)) catIds.add(String(p.category));
    if (p.brand && mongoose.isValidObjectId(p.brand)) brandIds.add(String(p.brand));
  }
  const [cats, brands] = await Promise.all([
    Category.find({ _id: { $in: [...catIds] } }).select('name').lean(),
    Brand.find({ _id: { $in: [...brandIds] } }).select('name').lean(),
  ]);
  return {
    categoryMap: new Map(cats.map((c) => [String(c._id), c.name])),
    brandMap: new Map(brands.map((b) => [String(b._id), b.name])),
  };
};

// ⚠️ ระบบนี้อยู่หลัง Cloudflare Tunnel — ทุก request มาจาก IP เดียวกัน (tunnel container)
// จึงนับ limit ตาม API key ไม่ใช่ IP เพื่อไม่ให้ partner ทุกเจ้าโดน limit ก้อนเดียวกัน
// requireApiKey รันก่อน limiter → ทุก request ที่ถึง limiter มี x-api-key ที่ valid เสมอ
// (ไม่ต้อง fallback ไป req.ip ซึ่งจะติด validation IPv6 ของ express-rate-limit)
const limiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-api-key'],
  message: { error: 'Too many requests' },
});

router.use(requireApiKey, limiter);

// GET /products — รายการสินค้า (เฉพาะ status=active เสมอ)
router.get('/products', async (req, res) => {
  try {
    const { q, category, fields } = req.query;

    const filters = { status: 'active' }; // force — ไม่รับ status จาก query
    if (category) filters.category = category;
    if (q) {
      const rx = { $regex: escapeRegex(String(q)), $options: 'i' };
      filters.$or = [{ name: rx }, { sku: rx }, { brand: rx }, { tags: { $in: [String(q)] } }];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      Product.find(filters).skip(skip).limit(limit), // ไม่ใช้ .lean() ให้ virtual ทำงาน (serializer ก็คำนวณ stock เองด้วย)
      Product.countDocuments(filters),
    ]);

    const allowed = parseFields(fields);
    const maps = await buildNameMaps(products);
    res.json({
      data: products.map((p) => serializeProduct(p, allowed, maps)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /products/sku/:sku — หาสินค้าจาก SKU ของ variant (หรือ SKU ระดับ product)
router.get('/products/sku/:sku', async (req, res) => {
  try {
    const sku = String(req.params.sku);
    const product = await Product.findOne({
      status: 'active',
      $or: [{ sku }, { 'variants.sku': sku }],
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const allowed = parseFields(req.query.fields);
    const maps = await buildNameMaps([product]);
    res.json({ data: serializeProduct(product, allowed, maps) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /products/:id — สินค้ารายตัวจาก id
router.get('/products/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const product = await Product.findOne({ _id: req.params.id, status: 'active' });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const allowed = parseFields(req.query.fields);
    const maps = await buildNameMaps([product]);
    res.json({ data: serializeProduct(product, allowed, maps) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

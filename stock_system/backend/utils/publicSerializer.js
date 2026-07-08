// ============================================================================
// Public Serializer — สร้าง object สำหรับส่งออกสู่ระบบภายนอกด้วยหลัก WHITELIST
//
// ⚠️ ห้ามเปลี่ยนเป็น blacklist (โหลดทั้งก้อนแล้ว delete ฟิลด์ต้นทุนออก) เด็ดขาด
//    ต้นทุน (cost) ฝังอยู่หลายชั้น: variant.cost และทุก batches[].cost/supplier
//    การหยิบเฉพาะฟิลด์ที่อนุญาต ทำให้ฟิลด์ใหม่ในอนาคตไม่หลุดโดยอัตโนมัติ
// ============================================================================

// ฟิลด์ระดับ product ที่อนุญาตให้ออกสู่ public (id + variants ติดมาเสมอ — ดูด้านล่าง)
export const PRODUCT_FIELDS = [
  'name', 'sku', 'description', 'category', 'brand', 'unit', 'tags', 'status',
];

// ฟิลด์ระดับ variant ที่อนุญาต — ไม่มี cost / batches / committed / incoming / supplier
export const VARIANT_FIELDS = [
  'name', 'sku', 'barcode', 'model', 'attributes',
  'price', 'status', 'stockOnHand', 'inStock', 'stockStatus',
];

// map ชื่อย่อที่เป็นมิตร (?fields=) → ชุดฟิลด์จริง
// ค่าที่ไม่รู้จักจะถูกเมิน (ไม่ error) — intersect กับ whitelist เสมอ
const FIELD_ALIASES = {
  price: ['price'],
  stock: ['stockOnHand', 'inStock', 'stockStatus'],
};

// แปลง attributes (Mongoose Map หรือ plain object) → plain object
const attributesToObject = (attributes) => {
  if (!attributes) return {};
  if (attributes instanceof Map) return Object.fromEntries(attributes);
  if (typeof attributes.toObject === 'function') return attributes.toObject();
  return { ...attributes };
};

// คำนวณ stockOnHand เอง (เผื่อ document ถูก .lean() แล้ว virtual หาย)
const calcStockOnHand = (variant) =>
  (variant.batches || []).reduce((sum, b) => sum + (b.quantity || 0), 0);

// logic เดียวกับ virtual stockStatus ใน Product model
const calcStockStatus = (stock, reorderPoint) => {
  const reorder = reorderPoint || 0;
  if (stock <= 0) return 'out-of-stock';
  if (stock <= reorder) return 'low-stock';
  if (stock <= reorder * 2) return 'warning';
  return 'in-stock';
};

// แปลง fieldsParam (เช่น "name,sku,price,stock") → { product:Set, variant:Set } หรือ null
// - ไม่ส่ง / ว่าง / ไม่มีตัวไหน match whitelist → คืน null (= ใช้ค่า default ทั้ง whitelist)
// - alias price/stock ขยายเป็นฟิลด์ variant จริง
// - ฟิลด์นอก whitelist → ถูกเมิน
export const parseFields = (fieldsParam) => {
  if (!fieldsParam || typeof fieldsParam !== 'string') return null;
  const requested = fieldsParam.split(',').map((s) => s.trim()).filter(Boolean);
  if (requested.length === 0) return null;

  const product = new Set();
  const variant = new Set();
  for (const field of requested) {
    const expanded = FIELD_ALIASES[field] || [field];
    for (const f of expanded) {
      if (PRODUCT_FIELDS.includes(f)) product.add(f);
      if (VARIANT_FIELDS.includes(f)) variant.add(f);
    }
  }

  // ไม่มีตัวไหน match เลย → ปฏิบัติเหมือนไม่ได้ส่ง fields (default ทั้งหมด)
  if (product.size === 0 && variant.size === 0) return null;
  return { product, variant };
};

// serialize variant หนึ่งตัว โดยหยิบเฉพาะฟิลด์ที่อยู่ใน allowed (null = ทั้ง whitelist)
// id ติดมาเสมอเพื่อใช้อ้างอิง
const serializeVariant = (variant, allowedVariant) => {
  const stockOnHand = calcStockOnHand(variant);
  const source = {
    name: variant.name,
    sku: variant.sku,
    barcode: variant.barcode,
    model: variant.model,
    attributes: attributesToObject(variant.attributes),
    price: variant.price ?? 0,
    status: variant.status,
    stockOnHand,
    inStock: stockOnHand > 0,
    stockStatus: calcStockStatus(stockOnHand, variant.reorderPoint),
  };

  const out = { id: variant._id ? String(variant._id) : undefined };
  for (const key of VARIANT_FIELDS) {
    if (allowedVariant && !allowedVariant.has(key)) continue;
    out[key] = source[key];
  }
  return out;
};

// serialize product หนึ่งตัว
// - allowed = ผลจาก parseFields() หรือ null (= ทั้ง whitelist)
// - maps  = { categoryMap, brandMap } แปลง id → ชื่อ (ถ้า resolve ไม่เจอ คงค่าเดิมไว้)
// - ส่งเฉพาะ variant ที่ status === 'active'
// - id ระดับ product + array variants ติดมาเสมอ (variants ถูกกรองด้วย allowed.variant)
export const serializeProduct = (product, allowed = null, maps = {}) => {
  const categoryName = maps.categoryMap?.get(String(product.category)) ?? product.category;
  const brandName = maps.brandMap?.get(String(product.brand)) ?? product.brand;
  const source = {
    name: product.name,
    sku: product.sku,
    description: product.description,
    category: categoryName,
    brand: brandName,
    unit: product.unit,
    tags: product.tags || [],
    status: product.status,
  };

  const out = { id: product._id ? String(product._id) : undefined };
  for (const key of PRODUCT_FIELDS) {
    if (allowed && !allowed.product.has(key)) continue;
    out[key] = source[key];
  }

  out.variants = (product.variants || [])
    .filter((v) => v.status === 'active')
    .map((v) => serializeVariant(v, allowed ? allowed.variant : null));

  return out;
};

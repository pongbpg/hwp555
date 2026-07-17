# Plan: Public Stock API สำหรับระบบภายนอกอ่านข้อมูลสินค้า

## เป้าหมาย
สร้าง **Public REST API** ให้ระบบภายนอก (partner/B2B) อ่านข้อมูลสินค้าจาก stock_system ได้
โดย:
- ยืนยันตัวตนด้วย **API Key** (header `X-API-Key`)
- **แสดง**: ชื่อสินค้า, รายละเอียด, หมวดหมู่, แบรนด์, variant, ราคาขาย (`price`), จำนวนคงคลัง (`stockOnHand`)
- **ซ่อนเด็ดขาด**: ราคาต้นทุน (`variant.cost`, `batches[].cost`), ซัพพลายเออร์ (`batches[].supplier`),
  และข้อมูลภายในอื่นๆ (`createdBy`, `updatedBy`, `consumptionOrder`, `_id` ภายใน ถ้าไม่จำเป็น)
- รองรับ **ออปชั่นเลือกฟิลด์** ที่จะส่งออก (field selection ผ่าน query param, ควบคุมด้วย whitelist)

## บริบท (Sonnet ต้องรู้)
- Stack: **Express + Mongoose (MongoDB)**, ES modules (`import/export`)
- Backend: `stock_system/backend/` — entry `server.js`, mount routes ใต้ `/api/*`
- Model: `stock_system/backend/models/Product.js`
  - `productSchema`: `name, sku, description, category, brand, unit, tags, status, variants[], skuProduct, ...`
  - `variantSchema`: `name, sku, barcode, model, attributes(Map), price, cost, committed, incoming,
    reorderPoint, allowBackorder, batches[], status`
  - **`stockOnHand` เป็น virtual** — คำนวณจาก `sum(batches[].quantity)` → ถ้าใช้ `.lean()` virtual จะหาย
    ต้องคำนวณเอง หรือไม่ใช้ `.lean()`
  - `batches[]` มี `cost`, `supplier`, `consumptionOrder` → **ข้อมูลลับ ห้ามหลุด**
- Auth ปัจจุบัน: `middleware/auth.js` = JWT ของพนักงาน (ไม่เกี่ยวกับงานนี้ — สร้าง middleware ใหม่แยก)
- `.env` โหลดจาก root (`../../.env`) แล้วตามด้วย local `.env` (ดู `server.js:19-20`)
- มี Cloudflare Tunnel token อยู่แล้ว → external เข้าถึงผ่าน tunnel ได้

## หลักการออกแบบสำคัญ (อ่านก่อนเขียนโค้ด)
> **ใช้ WHITELIST ไม่ใช่ BLACKLIST** — สร้าง object ใหม่โดยหยิบเฉพาะ field ที่อนุญาต
> ห้ามใช้วิธี "โหลดทั้งก้อนแล้ว delete field ต้นทุนออก" เพราะ `cost` ฝังอยู่หลายชั้น (variant + ทุก batch)
> พลาดครั้งเดียวต้นทุนหลุด การ whitelist ทำให้ field ใหม่ที่เพิ่มในอนาคตไม่หลุดโดยอัตโนมัติ

## ขั้นตอนการทำงาน

### 1. เพิ่ม dependency
- `cd stock_system/backend` แล้ว `npm install express-rate-limit`
- (ตรวจสอบก่อนว่ายังไม่มีใน `package.json`)

### 2. เพิ่ม env สำหรับ API keys
- เพิ่มใน root `.env` และ `.env.example`:
  ```
  # Public API — คั่นหลาย key ด้วย comma รองรับหลาย partner
  PUBLIC_API_KEYS=
  ```
- รูปแบบค่า: `key1,key2,key3` (ให้ผู้ใช้ gen เอง เช่น `openssl rand -hex 32`)
- **สำคัญ — production (Docker บน NAS)**: root `.env` ไม่ถูก mount เข้า container
  (build context คือ `./stock_system/backend` เข้าถึง `../../.env` ไม่ได้)
  ต้องเพิ่มใน `docker-compose.yml` → service `stock-backend` → `environment:`
  ```yaml
  PUBLIC_API_KEYS: ${PUBLIC_API_KEYS}
  ```
  (แพทเทิร์นเดียวกับ `LINE_CHANNEL_ACCESS_TOKEN` ที่มีอยู่แล้ว) — ถ้าข้ามขั้นนี้ API จะตอบ 503 บน NAS ตลอด

### 3. สร้าง middleware — `stock_system/backend/middleware/apiKey.js`
- export `requireApiKey`:
  - อ่าน `req.headers['x-api-key']`
  - เทียบกับรายการจาก `process.env.PUBLIC_API_KEYS.split(',').map(s => s.trim()).filter(Boolean)`
  - ใช้การเทียบแบบ **timing-safe** (`crypto.timingSafeEqual`) ต่อ key ที่ยาวเท่ากัน
    (ถ้ายาวไม่เท่า → ไม่ผ่าน โดยไม่ต้องเทียบ)
  - ไม่พบ header → `401 { error: 'API key required' }`
  - ไม่ตรง → `403 { error: 'Invalid API key' }`
  - ถ้า `PUBLIC_API_KEYS` ว่าง → ปฏิเสธทุก request (`503 { error: 'Public API not configured' }`)
    เพื่อกัน default เปิดโล่ง

### 4. สร้าง serializer — `stock_system/backend/utils/publicSerializer.js`
- นิยาม whitelist กลาง:
  ```js
  // field ระดับ product ที่อนุญาตให้ออกสู่ public
  const PRODUCT_FIELDS = ['id', 'name', 'sku', 'description', 'category', 'brand',
                          'unit', 'tags', 'status', 'variants'];
  // field ระดับ variant ที่อนุญาต (ไม่มี cost / batches / committed / incoming)
  const VARIANT_FIELDS = ['id', 'name', 'sku', 'barcode', 'model', 'attributes',
                          'price', 'status', 'stockOnHand', 'inStock', 'stockStatus'];
  ```
- ฟังก์ชัน `serializeVariant(variant, allowed)`:
  - `id` = `variant._id.toString()` (map เอง — ถ้าใช้ `.lean()` จะไม่มี getter `id` ให้)
  - **กรอง variant ที่ `status === 'inactive'` ออก — ส่งเฉพาะ active** (กรองที่ serializeProduct)
  - `stockOnHand` = `sum(batches[].quantity)` (คำนวณเอง เผื่อ `.lean()`)
  - `inStock` = `stockOnHand > 0` (boolean)
  - `stockStatus` = logic เดียวกับ virtual ใน model (`out-of-stock`/`low-stock`/`warning`/`in-stock`)
  - `attributes`: แปลง Mongoose Map → plain object
  - หยิบเฉพาะ key ใน `allowed ∩ VARIANT_FIELDS`
  - **ห้าม** ใส่ `cost`, `batches`, `supplier`, `consumptionOrder`, `committed`, `incoming` ไม่ว่ากรณีใด
    (ไม่อยู่ใน whitelist อยู่แล้ว — ย้ำเพื่อกันเผลอเพิ่ม)
- ฟังก์ชัน `serializeProduct(product, fieldsParam)`:
  - แปลง `fieldsParam` (เช่น `"name,sku,price,stock"`) เป็นชุด field ที่ขอ
  - intersect กับ whitelist เสมอ (นอก whitelist = เพิกเฉย ไม่ error)
  - ถ้าไม่ส่ง `fields` → ใช้ค่า default = ทั้ง whitelist
  - map alias ที่เป็นมิตร: `price`→variant.price, `stock`→stockOnHand+inStock (ระบุ mapping ให้ชัดใน docs)
  - คืน plain object พร้อมส่ง

### 5. สร้าง route — `stock_system/backend/routes/public-api.js`
- `const router = express.Router()`
- ใช้ `requireApiKey` + rate limiter กับทุก endpoint ในไฟล์นี้
  ```js
  // ⚠️ ระบบนี้อยู่หลัง Cloudflare Tunnel — ทุก request มาจาก IP เดียวกัน (tunnel container)
  // ห้ามนับ limit ตาม req.ip (default) เพราะ partner ทุกเจ้าจะโดน limit ก้อนเดียวกัน
  // → นับตาม API key แทน
  const limiter = rateLimit({ windowMs: 60_000, max: 60,
    standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => req.headers['x-api-key'] || req.ip,
    validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
    message: { error: 'Too many requests' } });
  router.use(limiter, requireApiKey);
  ```
- **GET `/products`** — list
  - query: `q` (ค้นชื่อ/sku/brand), `category`,
    `page` (default 1), `limit` (default 20, cap 100), `fields`
  - **ไม่รับ `status` จาก query** — force `filters.status = 'active'` ในโค้ดเสมอ
    (ถ้าปล่อยให้ส่ง `?status=archived` ได้ = external เห็นสินค้าที่เก็บเข้ากรุแล้ว ขัดข้อกำหนด)
  - **escape regex special chars ใน `q` ก่อนใส่ `$regex`** — ห้ามลอกแพทเทิร์นจาก
    `routes/products.js:60-66` ตรงๆ (internal มี JWT คุม แต่ public โดนยิงจากใครก็ได้ เสี่ยง ReDoS):
    ```js
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    ```
  - `Product.find(filters).skip().limit()` — **ไม่ใช้ `.lean()`** (ให้ virtual ทำงาน) หรือถ้าใช้ ให้คำนวณ stock เอง
  - response:
    ```json
    { "data": [ ...serialized ], "pagination": { "page":1,"limit":20,"total":N,"totalPages":M } }
    ```
- **GET `/products/:id`** — รายตัว
  - หา by `_id`; ถ้า id ไม่ valid หรือไม่พบ → `404 { error: 'Product not found' }`
  - รองรับ `?fields=` เช่นกัน
- (ออปชั่น ทำได้ถ้าง่าย) **GET `/products/sku/:sku`** — หา by variant sku
- ทุก response ผ่าน serializer เท่านั้น — ห้าม `res.json(product)` ดิบๆ

### 6. mount route ใน `server.js`
- `import publicApiRoutes from './routes/public-api.js';`
- `app.use('/api/public/v1', publicApiRoutes);`  ← มี versioning ตั้งแต่แรก
- วางต่อจาก mount ตัวสุดท้าย (`server.js:53`) ก่อน error handler (`server.js:59`)

### 7. เขียนเอกสาร — `docs/PUBLIC_API.md`
- Base URL, การใส่ header `X-API-Key`
- ตาราง endpoint + query params
- ตัวอย่าง request (`curl`) + response ตัวอย่าง
- **ตาราง field ที่อนุญาต** + mapping ของ `?fields=`
- ระบุชัดว่า cost/ต้นทุน/supplier **ไม่มีวันถูกส่งออก**
- rate limit ที่ใช้

### 8. ทดสอบ (manual)
- รัน backend ด้วย `npm run stock:backend` (จาก root)
  — **ห้ามใช้ `make`**: Makefile ของ repo นี้เป็น deploy tooling ขึ้น NAS ไม่ใช่คำสั่งรัน dev
- `curl` ไม่ใส่ key → 401; ใส่ key ผิด → 403; ใส่ key ถูก → 200
- ตรวจ JSON ที่ได้ **grep หา** `cost`, `supplier`, `batches`, `consumptionOrder` → ต้องไม่พบ
- ลอง `?fields=name,price,stock` → ได้เฉพาะที่ขอ
- ลอง `?fields=cost` → ต้องไม่มี cost ในผลลัพธ์ (ยืนยัน whitelist)
- ลอง pagination `?page=2&limit=5`

## ข้อกำหนดและข้อห้าม
- **ต้องทำ**:
  - ใช้ whitelist serializer เท่านั้น สำหรับทุก response ของ public route
  - middleware ใหม่แยกจาก JWT เดิม (`middleware/apiKey.js`) — ไม่แตะ `middleware/auth.js`
  - timing-safe comparison ของ API key
  - force `status='active'` ในโค้ด (ไม่รับจาก query) + กรอง variant `inactive` ออก
  - escape regex ใน `q` ก่อนใช้ `$regex`
  - rate limit นับตาม API key (ไม่ใช่ IP — อยู่หลัง Cloudflare Tunnel)
  - เพิ่ม `PUBLIC_API_KEYS: ${PUBLIC_API_KEYS}` ใน docker-compose.yml (service `stock-backend`)
  - versioned path `/api/public/v1/...`
- **ห้ามทำ**:
  - ห้ามส่ง `cost`, `variant.cost`, `batches` (ทั้งก้อน), `supplier`, `consumptionOrder`,
    `committed`, `incoming`, `createdBy`, `updatedBy` ออก public เด็ดขาด
  - ห้าม `res.json(productDoc)` หรือ spread ทั้ง document โดยไม่ผ่าน serializer
  - ห้ามแก้ schema/route เดิมของ internal (`routes/products.js`)
  - ห้าม hardcode API key ในโค้ด — อ่านจาก env เท่านั้น
  - ห้าม commit ค่า `PUBLIC_API_KEYS` จริงลง git (ใส่แค่ key ว่างใน `.env.example`)

## เกณฑ์ความสำเร็จ
1. `curl` พร้อม `X-API-Key` ถูกต้อง → ได้รายการสินค้า + ราคาขาย + จำนวนคงคลัง
2. grep ผลลัพธ์ JSON ทั้งหมด **ไม่พบ** `cost`/`supplier`/`batches`/`consumptionOrder`
3. ไม่มี key / key ผิด → 401 / 403 ตามลำดับ
4. `?fields=` เลือกฟิลด์ได้จริง และ field นอก whitelist ถูกเมิน (ไม่หลุด ไม่ error)
5. pagination ทำงาน (`total`, `totalPages` ถูกต้อง)
6. rate limit เกิน max → 429
7. `docs/PUBLIC_API.md` อธิบายครบใช้งานได้จริงโดยไม่ต้องดูโค้ด

## หมายเหตุ / จุดที่ควรถามก่อนถ้าไม่ชัด
- รูปแบบ mapping ของ `?fields=` (alias สั้น vs ชื่อ field ตรงๆ) — plan เสนอ alias `price`/`stock`;
  ถ้าผู้ใช้อยากได้ชื่อตรงตาม schema ให้ยืนยันก่อน
- ต้องการ endpoint `/categories`, `/brands` แบบ public ด้วยไหม (plan นี้ทำเฉพาะ products) — ถ้าต้องการค่อยเพิ่ม

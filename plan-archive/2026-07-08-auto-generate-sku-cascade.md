# Plan: Auto-generate SKU จากสูตร + cascade ไป movement/order (แก้ทั้งระบบ)

## เป้าหมาย
1. แก้ SKU ของ NIPPLE COVER 6 variants ที่ค้างผิด (`XSR-UDW-NPSH-VANILLA` ฯลฯ) ให้ถูกตามสูตร (`XSR-UDW-NC-VN-SH` ฯลฯ) พร้อม cascade ไป StockMovement + InventoryOrder — **ทำทันทีบน DB**
2. ทำให้ระบบ **auto-regenerate SKU จากสูตร** ทุกครั้งที่สร้าง/แก้ไขสินค้า และ cascade SKU ที่เปลี่ยนไปยัง movement/order อัตโนมัติ — เพื่อไม่ให้เกิดปัญหานี้อีก

## บริบท / สิ่งที่ค้นพบ
- DB จริง: `mongodb://root:password@192.168.1.155:27018/hwp555?authSource=admin` (docker-compose บน NAS)
- **สูตร SKU ที่ถูกต้อง (ยืนยันแล้ว ตรง 58/58 ของสินค้าอื่นทุกตัว):**
  ```
  SKU = [brand.prefix, category.prefix, product.skuProduct, variant.model,
         attributes.color, attributes.size, attributes.material]
        .filter(Boolean).join('-').toUpperCase()
  ```
  - brand.prefix / category.prefix มาจาก field `prefix` ใน collection brands/categories (XSARA→XSR, Underwear→UDW)
  - product.skuProduct = รหัสระดับสินค้า (WT, PG, SKP, LG, INST...) ; NIPPLE COVER = "" (ว่าง)
- NIPPLE COVER: _id=`6a4d0928be0751cbe35014c1`, skuProduct="", 6 variants (model=NC, color=VN/BG/HN, material=SH/GT)
- **บั๊ก frontend** (`stock_system/frontend/src/pages/Products.jsx`):
  - useEffect regenerate SKU มี guard `!editMode` → ตอนแก้ไขไม่ทำงาน (บรรทัด ~241-271)
  - `handleCategoryChange` ตอนเปลี่ยน category เก็บ suffix เดิมไว้ ไม่ regenerate จาก field (บรรทัด ~639+)
  - มีฟังก์ชัน `generateVariantSKU` (บรรทัด ~592) ที่สูตร**ถูกต้องตรงกัน**อยู่แล้ว
- **บั๊ก backend** (`stock_system/backend/routes/products.js`):
  - PUT `sku: newVariant.sku || oldVariant.sku` — ไม่ regenerate, ไม่ cascade
  - `generateSKUFromVariant` (บรรทัด 11) สูตร**ผิด**: ใช้ `brand.name`/`category.name` แทน `prefix`, คั่นด้วย ` - `, ไม่รวม skuProduct/model, และเรียกเฉพาะตอน POST ที่ sku ว่าง

## ขั้นตอนการทำงาน

### Phase 1 — แก้ข้อมูล NIPPLE COVER ทันที (DB script, ไม่ต้อง deploy)
1. Backup movements+orders ของ 6 variant → JSON ใน scratchpad
2. คำนวณ SKU ใหม่จากสูตร (ดึง brand.prefix, category.prefix, skuProduct, model, attributes)
3. อัปเดต `product.variants[].sku` ทั้ง 6
4. Cascade: `StockMovement.updateMany({variantId},{sku})` + `InventoryOrder.updateMany({items.variantId},{items.$[e].sku})` ตาม variantId
5. Verify: variant.sku == สูตร ทุกตัว, stale movement/order = 0, global orphan = 0

### Phase 2 — แก้โค้ดให้ auto ถาวร (ต้อง deploy)
6. **Backend** `routes/products.js`:
   - เขียน `generateSKUFromVariant` ใหม่ให้ใช้สูตรที่ถูกต้อง (prefix + skuProduct + model + color/size/material, join '-')
   - ใน POST และ PUT: regenerate `sku` ของทุก variant จากสูตร (เป็น source of truth) แทนการใช้ค่าที่ส่งมา
   - ใน PUT: หลัง save ถ้า variant ไหน sku เปลี่ยนจากเดิม → cascade ไป StockMovement + InventoryOrder ตาม variantId
   - โหลด brand/category prefix ครั้งเดียว (ไม่ query ต่อ variant)
7. **Frontend** `pages/Products.jsx`:
   - ให้ regenerate SKU จาก `generateVariantSKU` แบบ live เมื่อแก้ model/color/size/material/category/brand แม้อยู่ใน editMode (แสดง SKU ที่ถูกต้องก่อน save) — sku regen ไม่แตะ batches จึงปลอดภัย
8. Deploy ขึ้น NAS (`make deploy`) — **ขอยืนยันจากผู้ใช้ก่อน**

## ข้อกำหนดและข้อห้าม
- ต้องทำ: cascade อ้าง `variantId` เท่านั้น (idempotent), backup ก่อนเขียนเสมอ
- ต้องทำ: ใช้สูตรเดียวกันทั้ง frontend/backend/script
- ห้ามทำ: แตะ batches, quantity, cost, order totals, previousStock/newStock, variantId/_id
- ห้ามทำ: เปลี่ยน prefix ของ brand/category หรือ skuProduct โดยไม่ได้รับคำสั่ง
- ห้ามทำ: deploy production โดยไม่ยืนยัน

## สถานะ (อัปเดต)
- ✅ Phase 1 เสร็จ — NIPPLE COVER 6 variants แก้เป็น XSR-UDW-NC-{VN|BG|HN}-{SH|GT} + cascade movement/order (verify ผ่าน, live บน DB แล้ว)
- ✅ Phase 2 โค้ดเสร็จ — backend regenerate+cascade (routes/products.js), frontend regenerate live (Products.jsx), ผ่าน syntax/parse check
- ⏳ รอ deploy ขึ้น NAS (`make deploy`) เพื่อให้พฤติกรรม auto มีผลกับการแก้ไขครั้งต่อไป — **ยังไม่ deploy รอยืนยัน**

## เกณฑ์ความสำเร็จ
- NIPPLE COVER 6 variant มี SKU = XSR-UDW-NC-{VN|BG|HN}-{SH|GT} และ movement/order ตรงกัน
- global orphan sku = [] ; สินค้าอื่นทั้งหมด SKU ไม่เปลี่ยน (สูตรตรง 58/58 อยู่แล้ว)
- หลัง deploy: แก้ model/สี/หมวดหมู่ใน /products แล้ว SKU เปลี่ยนตามสูตรอัตโนมัติ + movement/order อัปเดตตาม

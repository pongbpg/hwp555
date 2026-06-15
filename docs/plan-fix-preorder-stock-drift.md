# Plan: แก้สต็อกเพี้ยนจาก Preorder (สต็อกติดลบ) + รับของ + ปรับปรุงสต็อก

> วิเคราะห์โดย Opus 4.8 — ห้าม Sonnet คิดเพิ่มนอกแผน ถ้าพบสถานการณ์ที่แผนไม่ครอบคลุม ให้หยุดถามผู้ใช้

## เป้าหมาย
1. แก้ตัวเลข `stockOnHand` ของสินค้าที่เพี้ยนจากบั๊ก "รับของทับ preorder แล้วไม่หักลบ backorder" ให้ถูกต้อง
2. ทำให้เครื่องมือซ่อมข้อมูล (repair tool) ตรวจเจอความผิดพลาดนี้ได้จริง — ของเดิมตรวจไม่เจอ จึง "แก้แล้วไม่หาย"
3. ยืนยันว่าโค้ดที่รันอยู่บน NAS เป็นเวอร์ชันที่แก้บั๊กแล้ว เพื่อไม่ให้เกิดซ้ำกับ PO ใหม่

## บริบท (สิ่งที่ Opus วิเคราะห์และพิสูจน์มาแล้ว — เชื่อถือได้)

### กลไกของบั๊ก (root cause)
- สินค้าที่เปิด `allowBackorder` เมื่อขายตอนสต็อก ≤ 0 ระบบจะสร้าง batch ชื่อขึ้นต้น `BACKORDER-` ที่มี `quantity` ติดลบ (เช่น -26)
- ตอน "รับของ" (`PATCH /inventory/orders/:id/receive`) **โค้ดเวอร์ชันเก่า** จะลบ BACKORDER batch ทิ้ง **แต่ไม่ได้หักจำนวนออกจาก batch ใหม่ที่รับเข้า**
  - ผล: รับ 300 ทับ backorder -26 → batch จริงกลายเป็น **300** (ที่ถูกต้องคือ 274)
  - แต่ StockMovement บันทึก `newStock = previousStock + quantity = -26 + 300 = 274` (สูตรตายตัว) → **ประวัติแสดง 274 (ถูก) แต่ batch จริงเป็น 300 (ผิด)** สต็อกจึง "เกินมา" 26 ชิ้นแบบเงียบ ๆ
- ทุก movement หลังจากนั้น (รวมการปรับปรุงสต็อก/ขาย) คำนวณบนฐาน 300 ที่เพี้ยน → ตัวเลขผิดทั้งสาย
  - ตรงกับอาการที่ผู้ใช้เจอเป๊ะ: รับของแสดง 274 ถูก แต่พอปรับปรุงสต็อก ระบบใช้ฐาน 300

### สถานะโค้ดปัจจุบัน — **แก้ถูกแล้ว ไม่ต้องแก้โค้ดอีก**
- โค้ด absorption ปัจจุบันอยู่ที่ `stock_system/backend/routes/inventory.js` บรรทัด ~865–893 (commit `3af5ce8` วันที่ 2026-05-16)
- Opus จำลอง logic แบบ standalone แล้ว: backorder (-1, -25) + รับ 300 → ได้ batch 274 **ถูกต้อง** ✅
- บั๊กที่เกิดเมื่อ 2026-05-30 (PO2569-0021) เกิดเพราะ **โค้ดบน NAS ตอนนั้นยังเป็นเวอร์ชันเก่า** (fix commit 05-16 แต่ deploy ทีหลัง) — ไม่ใช่บั๊กของโค้ดปัจจุบัน

### ทำไม Sonnet แก้รอบก่อนไม่หาย (สำคัญมาก)
- มี script `stock_system/backend/scripts/fix-backorder-stock.mjs` อยู่แล้ว แต่ฟังก์ชัน `computeExpectedStock` **"เชื่อถือ" ค่า `newStock` ของ movement ชนิด `adjust`** (โค้ด: ถ้า `movementType === 'adjust'` → `computed = mov.newStock`)
- แต่ตัว adjust movement เองก็ถูกปนเปื้อนมาแล้ว (เช่น `new=291` ทั้งที่ควรเป็น 265) → script จึงคำนวณ expected = ตรงกับ actual → **"ไม่พบความผิดพลาด" → ไม่แก้อะไรเลย** ข้อมูลจึงยังเพี้ยน

### วิธีตรวจที่เชื่อถือได้ = Chain-Gap (Opus ทดสอบกับ DB จริงแล้ว)
- เดินไล่ StockMovement เรียงตาม `createdAt` แล้วหาจุดที่ `movement[i].previousStock ≠ movement[i-1].newStock`
- ผลต่าง (gap) ที่จุดนั้นคือ "ความผิดพลาดที่ถูกฉีดเข้ามา" (injected error)
- **stockOnHand ที่ถูกต้อง = ผลรวม batch ปัจจุบัน − injected error**
- ภูมิคุ้มกันต่อ order ที่ถูก cancel โดยอัตโนมัติ (cancel กลับ batch โดยไม่บันทึก movement ย้อนกลับ จึงไม่สร้าง gap ในสายโซ่)
- มี script ตรวจพร้อมแล้วที่ `stock_system/backend/scripts/scan-drift.mjs`

### ผลตรวจ DB จริง (ปัจจุบันมี 2 SKU ที่ยังเพี้ยน — ค่าที่ต้องแก้เป็นค่าตายตัว)
| SKU | batch ปัจจุบัน (ผิด) | ค่าที่ถูกต้อง | ต้องลด | gap เกิดหลัง movement |
|-----|------|------|------|------|
| `XSR-MOM-PG-N-2XL` | 125 | **99** | 26 | in `PO2569-0021` |
| `XSR-SW-WT-N-2XL` | 20 | **16** | 4 | in `PO2569-0023` |

> SKU อื่นที่เคยมี buggy receive (เช่นชุด `XSR-SW-WT-B-*`) **ไม่ต้องแก้** เพราะความเพี้ยนถูกล้างไปแล้วด้วยการปรับสต็อกภายหลัง (chain-gap = 0) — ยึดผลจาก `scan-drift.mjs` เป็นหลัก ห้ามแก้มั่ว

## ข้อมูลการเชื่อมต่อ DB (สำหรับรัน script)
- `.env` อยู่ที่ root: `/Users/pongmini/DEVs/HWP555/.env` (`MONGODB_URI` ชี้ไป NAS `192.168.1.155:27018/hwp555`)
- **ต้องเติม `authSource=admin`** ต่อท้าย URI ไม่งั้น auth fail (script ใน scan-drift.mjs ทำให้ดูแล้ว)
- script ใช้ `loadEnv('../../..')` เพื่อโหลด `.env` จาก root

## ขั้นตอนการทำงาน

### ขั้นที่ 1 — ยืนยันว่าโค้ดล่าสุด (มี absorption) ถูก deploy บน NAS แล้ว
1. เปิด `stock_system/backend/routes/inventory.js` ตรวจว่าบล็อก absorption (ราว ๆ บรรทัด 865–893) ที่ขึ้นต้นด้วยคอมเมนต์ `// ✅ Absorb BACKORDER batches into the newly received stock.` ยังอยู่ครบ
2. แจ้งผู้ใช้ว่า **ต้อง deploy โค้ดล่าสุดขึ้น NAS** (เช่น `make deploy`) ถ้ายังไม่ได้ทำ — ป้องกันบั๊กเกิดซ้ำกับการรับของครั้งต่อไป
3. **ห้าม Sonnet สั่ง deploy เอง** ให้ถามผู้ใช้ก่อนเสมอ (เป็น outward-facing action)

### ขั้นที่ 2 — สร้าง script ซ่อมข้อมูลที่เชื่อถือได้ (chain-gap)
1. ใช้ logic จาก `stock_system/backend/scripts/scan-drift.mjs` (chain-gap ที่ทำงานถูกต้องแล้ว) เป็นฐาน สร้างไฟล์ใหม่ `stock_system/backend/scripts/fix-injected-stock.mjs` ที่:
   - รองรับ flag `--apply` (ค่า default = dry-run แสดงผลอย่างเดียว) และ `--sku <SKU>` (กรองเฉพาะ SKU)
   - คำนวณ `injectedError` ด้วย chain-gap ต่อ variant และ `correctStock = batchSum − injectedError`
   - โหมด dry-run: พิมพ์ตาราง SKU / batchSum / injectedError / correctStock / ตำแหน่ง gap
   - โหมด `--apply`: เรียกฟังก์ชันแก้ batch (ดูข้อ 2) แล้ว `product.markModified('variants')` + `product.save()`
2. ฟังก์ชันแก้ batch (ลด `injectedError` ออกจากของจริง):
   - ถ้า `injectedError > 0` (สต็อกเกิน — เคสนี้): ไล่ลดจาก batch ที่ `quantity > 0` แบบ FIFO (เรียง `receivedAt` เก่า→ใหม่) ทีละก้อนจนครบจำนวน `injectedError` (ใช้ logic เดียวกับ `applyStockCorrection` ใน `fix-backorder-stock.mjs` ได้)
   - ถ้า `injectedError < 0` (สต็อกขาด): สร้าง batch ใหม่ `quantity = -injectedError` cost = ต้นทุนเฉลี่ยของ batch บวก หรือ `variant.cost`
   - **ห้ามแตะ** field `incoming` และ batch ที่ขึ้นต้น `BACKORDER-`
3. **ห้าม** ใช้ `computeExpectedStock` แบบเดิมที่เชื่อ `adjust.newStock` เด็ดขาด (นั่นคือต้นเหตุที่ตรวจไม่เจอ)

### ขั้นที่ 3 — รันซ่อมข้อมูล (dry-run ก่อนเสมอ)
1. รัน dry-run ทั้งระบบ: `node scripts/fix-injected-stock.mjs` แล้วตรวจว่าผลตรงกับตารางในแผน (2 SKU: 2XL→99, WT-N-2XL→16)
2. ถ้าตรง → รันจริง: `node scripts/fix-injected-stock.mjs --apply`
3. ถ้า **ไม่ตรง** (เจอ SKU เพิ่ม/ค่าต่างจากตาราง) → **หยุด แจ้งผู้ใช้** อย่าเพิ่ง apply (อาจมีการขาย/ปรับสต็อกเพิ่มหลัง Opus วิเคราะห์)

### ขั้นที่ 4 — ตรวจสอบหลังแก้
1. รัน `node scripts/scan-drift.mjs` อีกครั้ง → ต้องได้ **"Total variants with injected error: 0"**
2. ตรวจค่าจริงรายตัว: `XSR-MOM-PG-N-2XL` ต้องได้ `stockOnHand = 99`, `XSR-SW-WT-N-2XL` ต้องได้ `16`

### ขั้นที่ 5 — Regression test (พิสูจน์ว่าโค้ดปัจจุบันรับของ preorder ได้ถูก)
1. เขียน test/สคริปต์จำลอง flow: สร้างสินค้า allowBackorder → ขายจนติดลบ (เช่น -26) → รับของ +300 → ปรับปรุงสต็อกลด 9
2. คาดหวัง: หลังรับของ `stockOnHand = 274`, หลังปรับปรุง `stockOnHand = 265`
3. ถ้าผ่าน = ยืนยันโค้ดปัจจุบันถูก (ปัญหาเดิมคือ deploy เก่า + ข้อมูลค้าง) ทำได้ผ่าน script จำลอง logic แบบ standalone ก็พอ ไม่ต้องยิง API จริงถ้าไม่สะดวก

### ขั้นที่ 6 (ทางเลือก — ทำต่อเมื่อผู้ใช้ต้องการ)
- เขียนทับ `previousStock`/`newStock` ในประวัติ StockMovement ของ 2 SKU ให้สายโซ่ต่อเนื่องสวยงาม (หน้า Movements จะได้ไม่แสดงเลขฐานเก่า)
- **ไม่บังคับ** และมีความเสี่ยงต่อข้อมูลประวัติ — ทำเฉพาะเมื่อผู้ใช้ยืนยัน และต้อง backup ก่อน

## ข้อกำหนดและข้อห้าม
- **ต้องทำ:**
  - รัน dry-run และเทียบกับตารางในแผนก่อน `--apply` ทุกครั้ง
  - แก้เฉพาะ SKU ที่ chain-gap detector ชี้ว่า `injectedError ≠ 0` เท่านั้น
  - ใช้ `authSource=admin` ในการต่อ DB
  - เก็บ batch `BACKORDER-` และ field `incoming` ไว้ ไม่แตะ
- **ห้ามทำ:**
  - ห้ามแก้โค้ด absorption ใน `inventory.js` (ถูกแล้ว) — ถ้าคิดว่าต้องแก้ ให้หยุดถามผู้ใช้ก่อน
  - ห้ามใช้ตัวตรวจที่เชื่อ `adjust.newStock` (วิธีเดิมที่พัง)
  - ห้าม deploy ขึ้น NAS เอง — ถามผู้ใช้
  - ห้ามแก้ตัวเลขสต็อกแบบ hardcode มือเปล่าโดยไม่ผ่าน detector
  - ห้ามแก้ `plan.md` นี้ระหว่างทำงาน

## เกณฑ์ความสำเร็จ
1. `node scripts/scan-drift.mjs` แสดง `Total variants with injected error: 0`
2. `XSR-MOM-PG-N-2XL` มี `stockOnHand = 99` และ `XSR-SW-WT-N-2XL` มี `stockOnHand = 16`
3. Regression test: preorder ติดลบ → รับของ → ปรับปรุงสต็อก ได้ตัวเลขถูกต้อง (274 แล้ว 265)
4. ผู้ใช้ได้รับแจ้งให้ deploy โค้ดล่าสุดขึ้น NAS (ถ้ายังไม่ได้ทำ) เพื่อกันบั๊กซ้ำ

## ไฟล์ที่เกี่ยวข้อง
- `stock_system/backend/routes/inventory.js` (~865–893: absorption — อ่านอย่างเดียว, ถูกแล้ว)
- `stock_system/backend/scripts/scan-drift.mjs` (chain-gap detector — Opus สร้างไว้ ใช้ตรวจ)
- `stock_system/backend/scripts/fix-backorder-stock.mjs` (ของเดิม — พัง เพราะเชื่อ adjust.newStock, ใช้เป็นแหล่ง logic การแก้ batch ได้แต่ห้ามใช้ detector ของมัน)
- `stock_system/backend/scripts/fix-injected-stock.mjs` (ไฟล์ใหม่ที่ Sonnet ต้องสร้าง)
- `stock_system/backend/services/costingService.js` (consume/batch logic — อ่านประกอบ)

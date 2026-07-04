# Plan: แก้ LINE alert แสดง SKU ไม่ครบเมื่อเทียบกับหน้า /replenishment

## เป้าหมาย

ทำให้การ์ดแจ้งเตือน LINE "สินค้าใกล้หมด" แสดง SKU และยอดแนะนำสั่ง **ครบทุกตัวของสินค้านั้น** ตรงกับหน้า `/replenishment` (กรณีตัวอย่าง: เวสเทรนเนอร์ ต้องเป็น 9 SKU / 430 ชิ้น ไม่ใช่ 5 SKU / 294 ชิ้น)

## บริบท

### อาการ
- LINE แจ้ง "เวสเทรนเนอร์ · 5 SKU รวมแนะนำสั่ง 294 ชิ้น" (B-2XS:36, B-S:108, N-XS:54, N-M:69, N-L:27)
- หน้า `/replenishment` แสดง 9 SKU รวม 430 ชิ้น
- SKU ที่หายไปจาก LINE 4 ตัว: N-2XS (24), B-2XL (27), N-S (68), N-2XL (17) → รวม 136 ชิ้น และ 294 + 136 = 430 พอดี
- **SKU 5 ตัวที่ซ้ำกันทั้งสองที่ ตัวเลข "เหลือ/แนะนำ" ตรงกันเป๊ะทุกตัว** → สูตรคำนวณ (order-up-to, ROP, avgDailySales) ถูก align กันแล้วจากงานก่อนหน้า ปัญหาไม่ได้อยู่ที่สูตร

### สาเหตุ (root cause)
LINE alert ถูก trigger จาก `checkAndAlertAfterSale(soldItems)` เท่านั้น ซึ่ง**เช็คเฉพาะ variant ที่อยู่ในบิลขายที่เพิ่งบันทึก** ไม่ได้เช็ค variant อื่นของสินค้าเดียวกัน:

- `stock_system/backend/routes/inventory.js:707-716` — ตอนสร้าง order (sale/damage/expired) สร้าง `soldItems` จาก `orderItems` ของบิลนั้น แล้วเรียก `checkAndAlertAfterSale(soldItems, { sendNotification: true })`
- `stock_system/backend/services/stockAlertService.js:199-238` — `checkAndAlertAfterSale` วนลูปเฉพาะ `soldItems` ทีละ variant → variant ที่สต็อกต่ำอยู่แล้วแต่ไม่อยู่ในบิลนั้น (N-2XS, B-2XL, N-S, N-2XL) จึงไม่เคยติดเข้าการ์ด
- `checkAllStockRisks` (`stockAlertService.js:282`) ที่เช็คทุกสินค้า **ไม่มีใครเรียกใช้เลย** (ไม่มี cron/scheduled job ใน backend) และถ้าเรียกก็ส่งแบบ text ไม่ใช่ flex

ส่วนหน้า `/replenishment` ดึงจาก `GET /inventory/insights` (`inventory.js:1443`) ซึ่งวน**ทุก variant ของทุก product** ด้วยเงื่อนไข `availableStock <= suggestedReorderPoint` เดียวกัน จึงเห็นครบ 9 SKU

ตรวจสอบแล้วว่า SKU ที่หายทั้ง 4 ตัวเข้าเงื่อนไข `isLowStock` ของ insights ตามปกติ (ไม่ได้มาจาก logic เติม fast-mover เพื่อ MOQ ฝั่ง frontend) ดังนั้นแก้ที่ scope ของการเช็คฝั่ง LINE ก็เพียงพอ

### แนวทางแก้
ขยาย `checkAndAlertAfterSale` ให้เช็ค **ทุก active variant ของ product ที่มีของในบิล** (ยกระดับจาก variant-level เป็น product-level) — เมื่อขายสินค้าใดแล้วมี variant ใดของสินค้านั้นเข้าเงื่อนไขเตือน การ์ดจะรวม variant สต็อกต่ำทั้งหมดของสินค้านั้น เหมือนหน้าเว็บ

## ขั้นตอนการทำงาน

1. แก้ `stock_system/backend/services/stockAlertService.js` ฟังก์ชัน `checkAndAlertAfterSale` (บรรทัด ~199-238):
   - จาก `soldItems` สร้างรายการ `productId` ที่ไม่ซ้ำ (unique) เช่นใช้ `Set` ของ `String(item.productId)`
   - วนลูปทีละ product: `const product = await Product.findById(productId)` ถ้าไม่เจอให้ `continue`
   - วนลูป **ทุก variant** ใน `product.variants` โดยข้าม variant ที่ `variant.status !== 'active'` (แบบเดียวกับ `checkAllStockRisks` บรรทัด 298-299)
   - เรียก `const alert = await checkVariantStockRisk(product, variant)` โดย**ไม่ต้องส่ง `avgDailySales` เข้าไป** (ปล่อยให้ฟังก์ชันคำนวณเองจาก leadTime+buffer ซึ่งเป็น logic เดิมอยู่แล้ว) — ลบโค้ดที่ precompute `avgDailySales` ต่อ variant ที่ขายออกได้
   - ถ้ามี alert ให้ push เข้า `alerts`
   - คงส่วนส่ง notification (flex/text ตาม `notificationType`) และโครงสร้าง return `{ alertCount, alerts, notificationSent, notificationResult }` ไว้เหมือนเดิม
2. เรียงลำดับ `alerts` ก่อนส่ง ด้วย logic เดียวกับ `checkAllStockRisks` (บรรทัด 315-323: เรียงตาม stockStatus แล้วตาม daysOfStock) เพื่อให้ SKU วิกฤตขึ้นก่อนในตาราง
3. คง log debug (`logDebug`) รูปแบบเดิมไว้ ปรับข้อความให้สะท้อนว่าเช็คระดับ product ได้ แต่ไม่บังคับ
4. ตรวจว่า `routes/inventory.js:707-716` ไม่ต้องแก้ (ยังส่ง `soldItems` เหมือนเดิม เพราะ service ไปขยายเป็น product-level เอง) — ห้ามเปลี่ยน signature ของ `checkAndAlertAfterSale`
5. ทดสอบ:
   - รัน backend แล้วสร้าง order ประเภท `sale` ที่มีสินค้าเวสเทรนเนอร์ 1 SKU (ตัวไหนก็ได้ที่สต็อกต่ำ)
   - เปิด `DEBUG_STOCK_ALERTS=1` แล้วดู log ว่า alert ถูกสร้างครบทุก SKU ที่สต็อกต่ำของเวสเทรนเนอร์ (ตามข้อมูลปัจจุบันคือ 9 SKU) และผลรวม `suggestedOrder` ตรงกับหน้า `/replenishment`
   - ถ้าทดสอบส่ง LINE จริงไม่สะดวก ให้เรียกด้วย `sendNotification: false` แล้วตรวจ `alerts` ที่ return แทน

## ข้อกำหนดและข้อห้าม

- ต้องทำ: ขยาย scope การเช็คเป็น product-level ภายใน `checkAndAlertAfterSale` เท่านั้น
- ต้องทำ: กัน product ซ้ำ (บิลเดียวมีหลาย variant ของสินค้าเดียวกัน ต้องเช็ค product นั้นครั้งเดียว ไม่งั้น SKU จะซ้ำในการ์ด)
- ห้ามทำ: แก้สูตรคำนวณใดๆ (`checkVariantStockRisk`, `calculateReorderMetrics`, order-up-to, MOQ) — ตัวเลขต่อ SKU ตรงกับหน้าเว็บอยู่แล้ว
- ห้ามทำ: แก้ endpoint `/inventory/insights` หรือ frontend `/replenishment`
- ห้ามทำ: เพิ่ม cron/scheduled job ในงานนี้ (ถ้าจะมี daily summary ให้เป็นงานแยกภายหลัง)
- ห้ามทำ: เปลี่ยน layout/รูปแบบการ์ด flex ใน `lineNotify.js` (การ์ดปัจจุบันโอเคแล้ว แค่ข้อมูลไม่ครบ)

## เกณฑ์ความสำเร็จ

- ขายสินค้าเวสเทรนเนอร์ 1 บิล (SKU เดียวก็ได้) แล้วการ์ด LINE แสดง SKU สต็อกต่ำ**ครบทุกตัว**ของเวสเทรนเนอร์ และ "รวมแนะนำสั่ง" เท่ากับยอด "แนะนำทั้งหมด" ในหน้า `/replenishment` ณ เวลาเดียวกัน (ข้อมูลปัจจุบัน = 9 SKU / 430 ชิ้น)
- SKU ที่สต็อกไม่ต่ำ (ไม่เข้าเงื่อนไข alert) ต้องไม่โผล่ในการ์ด
- ขายสินค้าอื่นที่ไม่มี variant ใดสต็อกต่ำ → ไม่มีการส่งแจ้งเตือน (พฤติกรรมเดิม)
- บิลที่มีหลายสินค้า → การ์ดแยกกลุ่มตาม product เหมือนเดิม ไม่มี SKU ซ้ำ

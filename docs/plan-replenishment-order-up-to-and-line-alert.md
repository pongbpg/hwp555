# แผน: ยอดแนะนำสั่งแบบ Min-Max (order-up-to) + แจ้งเตือน LINE จัดกลุ่ม

> สถานะ: **ทำเสร็จและทดสอบใช้งานจริงแล้ว** (ยิง LINE จริงผ่าน, deploy NAS แยกต่างหาก)
> commit หลัก: `7010300` (Min-Max), `1ddaad7` (LINE group), `554c6e7` (ปรับการ์ด)

## เป้าหมาย
ทำให้ "ยอดแนะนำสั่ง" ใช้นโยบายมาตรฐาน **Min-Max (order-up-to)** ที่สั่งล็อตใหม่เต็มคาบเผื่อขายต่อทันทีหลังของเดิมหมด, ใช้เลขเดียวกันทุกหน้าจอ (Replenishment / Insights / Alerts / LINE) และจัดการ MOQ ขั้นต่ำโรงงานแยกชั้นชัดเจน

---

## โมเดล Min-Max (หลักการบริหารสต็อกมาตรฐาน)

นิยามต่อ SKU:
- **d** = ยอดขายเฉลี่ย/วัน (คิดจากยอดขายช่วง `leadTimeDays + bufferDays` ย้อนหลัง) = `reorderDailySalesRate`
- **P** = `leadTimeDays + bufferDays` (คาบครอบคลุม)
- **demand** = `ceil(d × P)` = ยอดขาย 1 คาบ = **Min (ROP / จุดสั่ง)**
- **M** = `product.orderCoverageMultiplier` (default **2**) — ตั้งได้ต่อสินค้า
- **orderUpTo (Max)** = `ceil(demand × M)` = เพดานที่จะเติมให้ถึง
- **availableStock** = `stockOnHand + purchaseRemaining` (รวมของ PO ค้างกำลังเข้า)

สูตร:
```
ทริกเกอร์ให้สั่ง (อยู่ในลิสต์/แจ้งเตือน):  availableStock ≤ Min (demand)
recommendedOrderQty (ยอดแนะนำสั่ง)        = max(0, orderUpTo − availableStock)
```

ตัวอย่าง (P=30, demand=100, M=2 → Max=200): สต็อก 80 → แนะนำ 120 ; สต็อก 100 → 100 ; 110 (Min<stock<Max) → 0 ; ≥200 → 0

---

## MOQ "ถัว" (เฉพาะหน้า Replenishment — ชั้นเดียว)
- เมื่อ `Σ recommendedOrderQty < minOrderQty` และมี SKU ที่ต้องสั่ง → กระจายส่วนที่ขาด (`deficit`) ตามสัดส่วนยอดขายด้วย Largest Remainder ให้ยอดรวม = MOQ พอดี
- eligible = SKU ที่ `availableStock < demand` เท่านั้น (รวม fast mover ที่ดึงเข้ามาด้วยฐาน order-up-to) — **ห้ามยัดให้ SKU ที่สต็อก ≥ demand**
- ตัวหาร = Σ weight เฉพาะ eligible (แก้บั๊กเดิมที่หารด้วย fast mover ทั้งหมด)
- `Σrec = 0` → ไม่บังคับ MOQ

---

## แจ้งเตือน LINE
- **trigger** = `availableStock ≤ computedReorderPoint` (Min) — ตรงกับหน้าเว็บ (เดิมใช้แค่ `daysOfStock ≤ leadTime` จึงเตือนไม่ครบ)
- **เลข "แนะนำสั่ง" = order-up-to ดิบต่อ SKU (ไม่ใส่ MOQ ถัว)** — MOQ เป็นการตัดสินใจตอนวางแผนซื้อในหน้า Replenishment ไม่ใช่ต่อ SKU
- **การ์ดจัดกลุ่มตามสินค้า**: 1 การ์ด = 1 กลุ่มสินค้า, list SKU แบบตาราง
  - หัวการ์ด: ชื่อสินค้า + จำนวน SKU + `Lead+Buffer: L+B = P วัน` (สีส้ม=ใกล้หมด / แดง=หมด)
  - ตาราง: `SKU | เหลือ | พอ | แนะนำสั่ง` (เหลือ/พอ แยกคอลัมน์, "พอ" เขียน "X วัน" เต็มคำ)
  - SKU แสดงเฉพาะ 2 ส่วนท้าย (Color-Size) ตัด prefix สินค้าที่ซ้ำออก เช่น `XSR-MOM-PG-N-2XL → N-2XL`
  - ท้ายการ์ด: รวมแนะนำสั่ง + MOQ (ถ้ามี)
- ข้อความ Text (fallback) จัดกลุ่มแบบเดียวกัน

---

## ไฟล์ที่แก้
| ไฟล์ | สาระ |
|------|------|
| `backend/models/Product.js` | + field `orderCoverageMultiplier` (Number, default 2, min 1) |
| `backend/routes/inventory.js` | reorderSuggestions = order-up-to + ส่ง `demandForecast/orderUpToLevel/coverageMultiplier`; fastMovers ส่งฐานช่วง lead+buffer; GET /alerts ใช้ order-up-to |
| `backend/routes/products.js` | whitelist `orderCoverageMultiplier` ตอน update |
| `backend/services/stockAlertService.js` | suggestedOrder = order-up-to; trigger = computedReorderPoint; checkAllStockRisks ไม่ใส่ MOQ (raw); ส่ง `bufferDays/minOrderQty` |
| `backend/utils/lineNotify.js` | การ์ด/ข้อความ LINE จัดกลุ่มตามสินค้า + SKU สั้น + คอลัมน์ เหลือ/พอ แยก + "วัน" เต็ม |
| `frontend/src/pages/ReplenishmentOrder.jsx` | ใช้ order-up-to เป็นฐาน + MOQ ชั้นเดียว |
| `frontend/src/pages/Products.jsx` | ช่องตั้งค่า "ตัวคูณเพดานเติม (Order-up-to)" |

## หมายเหตุ
- เชื่อม mongo จากนอก NAS ต้องเติม `?authSource=admin` (บน NAS ต่อผ่าน docker network ใช้ URI เดิมได้ ไม่กระทบ)
- สินค้าเดิมที่ยังไม่มี `orderCoverageMultiplier` → ใช้ `?? 2` อัตโนมัติ ไม่ต้อง migrate

## เกณฑ์ความสำเร็จ (ผ่านแล้ว)
1. demand 100 / สต็อก 80 / M=2 → แนะนำ 120 ✅
2. สต็อก ≥ Max → 0 ; Min<stock<Max → ยังไม่ทริกเกอร์ ✅
3. แนะนำทั้งหมด = Σ recommendedOrderQty ; Σ<MOQ → ผลรวมสั่ง = MOQ พอดี ; Σ=0 → ไม่บังคับ ✅
4. Insights / GET /alerts / LINE ใช้เลข order-up-to เดียวกัน ✅
5. LINE เตือนครบทุก SKU ที่ stock ≤ Min (ทดสอบจริง 5 SKU) ✅
6. การ์ด LINE จัดกลุ่ม + SKU สั้น + คอลัมน์แยก + "วัน" เต็ม (ยิงจริงผ่าน) ✅

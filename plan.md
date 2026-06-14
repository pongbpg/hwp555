# plan.md — สูตร "ยอดแนะนำสั่ง" แบบ Min-Max (order-up-to) + MOQ ในหน้า ReplenishmentOrder

> **สถานะ:** รอบก่อนได้แก้ `recommendedOrderQty` ให้เป็น net = `max(0, demand − stock)` ไปแล้ว
> แต่ใช้จริงพบว่า "เติมแค่ให้ถึง demand (1 คาบ)" สั่งน้อยเกินไป (เคส demand 100 สต็อก 80 → ได้ 20)
> รอบนี้เปลี่ยนเป็นนโยบายมาตรฐาน **Min-Max / order-up-to** ตามที่ user ยืนยัน (ต้องได้ 120)

## เป้าหมาย

ทำให้ "ยอดแนะนำสั่ง" ใช้นโยบาย Min-Max: เตือนเมื่อสต็อกแตะ **Min (ROP)** และสั่งเติมให้ถึง **Max (order-up-to)** โดยหักของในมือ+ของกำลังเข้าออก เพื่อให้สั่งล็อตใหม่เต็มคาบเผื่อขายต่อทันทีหลังของเดิมหมด พร้อมกลไก MOQ "ถัว" ที่ทำงานเป็นชั้นเดียวสอดคล้องกัน

## บริบท — หลักการ Min-Max (มาตรฐานบริหารสต็อก)

นิยามต่อ SKU:
- **d** = ยอดขายเฉลี่ย/วัน (คิดจากช่วง leadTime + buffer ย้อนหลัง) = `reorderDailySalesRate`
- **P** = `leadTimeDays + bufferDays` (คาบทบทวน/ครอบคลุม)
- **demand** = `ceil(d × P)` = ปริมาณขาย 1 คาบ = **Min (ROP)** จุดเตือนให้สั่ง
- **M** = ตัวคูณเป้าหมาย (coverage multiplier) — **default 2** ตั้งได้ต่อ product
- **orderUpTo (Max)** = `ceil(d × P × M)` = ระดับเป้าหมายที่จะเติมให้ถึง
- **availableStock** = `stockOnHand + purchaseRemaining` (รวมของกำลังเข้า — user ยืนยัน)

สูตรหลัก:
```
ทริกเกอร์ให้สั่ง (อยู่ในลิสต์):  availableStock ≤ Min (= demand)        ← เดิมมี isLowStock อยู่แล้ว
recommendedOrderQty (ยอดแนะนำ) = max(0, orderUpTo − availableStock)
```

ตัวอย่างตรวจสอบ (P=30, d≈3.33, demand=100, M=2 → orderUpTo=200):
| สต็อก (availableStock) | อยู่ในลิสต์? | ยอดแนะนำ |
|---|---|---|
| 80 (< Min 100) | ใช่ | **120** = 200−80 ✅ |
| 100 (= Min) | ใช่ (พอดีจุดเตือน) | 100 |
| 110 (Min < stock < Max) | ไม่ (ยังไม่แตะ Min) | 0 |
| 200 (= Max) | ไม่ | 0 |

> หลักการนี้คือ Min-Max / (s,S) policy ที่ร้านค้า–อีคอมเมิร์ซใช้จริง (พูดเป็น "days of cover" ก็ได้: เตือนที่ 30 วัน เติมถึง 60 วัน เมื่อ M=2)

### MOQ (minOrderQty) — ทำงานทับด้านบน (เหมือนเดิม)
- ค่าที่ user ตั้งเอง เพราะโรงงานสั่งขั้นต่ำเยอะ
- เมื่อ `Σ recommendedOrderQty (ทุก SKU) < MOQ` และมี SKU ที่ต้องสั่ง → "ถัว" ส่วนที่ขาด (`deficit = MOQ − Σrec`) กระจายลง SKU ตามสัดส่วนยอดขาย (Largest Remainder) ให้ยอดรวม = MOQ พอดี
- **เติมได้เฉพาะ SKU ที่อยู่ในลิสต์ (availableStock < Min)** + ดึง fast mover ที่ `availableStock < Min` เข้ามาได้ — **ห้ามยัดให้ SKU ที่สต็อก ≥ Min**
- ถ้า `Σrec = 0` → ไม่บังคับ MOQ ; ถ้าไม่มี SKU eligible → ดันไม่ถึง MOQ ได้ ให้แจ้งสถานะ (ไม่ยัดของล้น)

### สถานะโค้ดปัจจุบัน (หลังรอบที่แล้ว — ต้องแก้ต่อ)
- `backend/routes/inventory.js` ~1737: ตอนนี้ `recommendedOrderQty = max(0, demandForecast − availableStock)` (net 1 คาบ) → **ต้องเปลี่ยนเป็น order-up-to**
- ส่ง `demandForecast` ใน reorderSuggestions และ fastMovers แล้ว (มี `reorderDailySalesRate`, `leadTimeDays`, `bufferDays` ใน fastMovers ด้วย)
- `frontend/ReplenishmentOrder.jsx`: ใช้ `recommendedOrderQty` เป็นฐานตรงๆ, MOQ ชั้นเดียว (Largest Remainder), pull-in fast mover ที่ `currentStock < demandForecast` แล้ว — โครงสร้างพร้อม แค่ฐานตัวเลขต้องเป็น order-up-to
- ผู้บริโภคฟิลด์: `frontend/Insights.jsx:~1180` ใช้ `recommendedOrderQty` แสดง "ต้องสั่งเติม" → จะเปลี่ยนตามอัตโนมัติ (ต้องทดสอบ)

---

## ขั้นตอนการทำงาน

### ขั้นที่ 1 — Backend: เปลี่ยน `recommendedOrderQty` เป็น order-up-to
ไฟล์ `stock_system/backend/routes/inventory.js` (บล็อก `if (isOutOfStock || isLowStock)` ~บรรทัด 1737)
```js
const demandForecast = suggestedOrderQty;                       // = d × P (Min / ROP / 1 คาบ)
const coverageMultiplier = product.orderCoverageMultiplier ?? 2; // M (default 2, ตั้งได้ต่อ product)
const orderUpToLevel = Math.ceil(demandForecast * coverageMultiplier); // Max
const recommendedOrderQty = Math.max(0, orderUpToLevel - availableStock);
```
- เงื่อนไขส่งออก: `if (recommendedOrderQty > 0 || isOutOfStock)` (คงเดิม)
- เพิ่มลง object ที่ push: `orderUpToLevel`, `coverageMultiplier` (มี `demandForecast` แล้ว)
- **ห้ามแตะ** `calculateReorderMetrics` และ trigger `isLowStock` (= Min/ROP ถูกแล้ว)

### ขั้นที่ 2 — Backend: ส่ง order-up-to ให้ fastMovers ด้วย
ไฟล์เดียวกัน บล็อก `fastMoversDetailed.push` (~บรรทัด 1687)
- เพิ่มฟิลด์ `orderUpToLevel: Math.ceil(Math.ceil(reorderDailySalesRate*(leadTimeDays+bufferDays)) * (product.orderCoverageMultiplier ?? 2))`
  (หรือคำนวณ `demandForecast` ที่มีอยู่แล้ว × multiplier ให้ตรงกัน)
- ใช้เพื่อให้ frontend คำนวณยอดของ fast mover ที่ดึงเข้ามาด้วยฐานเดียวกัน

### ขั้นที่ 3 — Backend: เพิ่ม schema field `orderCoverageMultiplier`
ไฟล์ product model (หา: `grep -rn "leadTimeDays" stock_system/backend/models`)
- เพิ่มฟิลด์ `orderCoverageMultiplier: { type: Number, default: 2, min: 1 }` ระดับ product
- ไม่บังคับให้ user กรอกตอนนี้ (default 2) — แต่เปิดทางตั้งค่าภายหลัง
- ถ้าไม่อยากแตะ schema ในรอบนี้: ใช้ `?? 2` ใน route ไปก่อน และบันทึกเป็น TODO (ให้ถาม user)

### ขั้นที่ 4 — Frontend: คำนวณยอด fast mover pull-in ด้วย order-up-to
ไฟล์ `stock_system/frontend/src/pages/ReplenishmentOrder.jsx` (loop pull-in fast mover ~บรรทัด 114-136)
- eligible คงเดิม: `fm.currentStock < fm.demandForecast` (แตะ Min)
- เปลี่ยน net ที่ assign: `const net = Math.max(0, (fm.orderUpToLevel || 0) - (fm.currentStock || 0));`
- ที่เหลือ (MOQ ชั้นเดียว, blue/green, recalc) **ไม่ต้องแก้** เพราะใช้ `recommendedOrderQty` เป็นฐานอยู่แล้ว

### ขั้นที่ 5 — ทดสอบ
- เคสตัวอย่าง demand 100 / สต็อก 80 / M=2 → "แนะนำ" = **120**
- SKU สต็อก ≥ Max → ไม่อยู่ในลิสต์ / 0
- Σrec < MOQ → green รวม = MOQ พอดี ; Σrec = 0 → ไม่บังคับ MOQ
- หน้า Insights "ต้องสั่งเติม" แสดงค่าใหม่ ไม่ error
- ตรวจ `node --check` (backend) + build/bundle (frontend) ผ่าน

---

## ข้อกำหนดและข้อห้าม

**ต้องทำ:**
- ยอดแนะนำ = `max(0, orderUpTo − availableStock)` โดย `orderUpTo = ceil(demand × M)`, `M = product.orderCoverageMultiplier ?? 2`
- trigger การอยู่ในลิสต์ = `availableStock ≤ Min (demand)` (คง isLowStock เดิม)
- `availableStock = stockOnHand + purchaseRemaining`
- MOQ ชั้นเดียว ตัวหาร = Σ weight เฉพาะ eligible, ผลรวม = MOQ เป๊ะ
- blue (แนะนำ) / green (สั่งเพิ่ม) มาจากฐานเดียวกัน

**ห้ามทำ:**
- ห้ามแก้ `calculateReorderMetrics` (Min/demand ถูกแล้ว)
- ห้ามบังคับ MOQ เมื่อ `Σrec = 0` หรือยัดให้ SKU ที่ `availableStock ≥ Min`
- ห้ามหักสต็อกซ้ำ (backend หักทีเดียวใน recommendedOrderQty)
- ห้ามแก้ชื่อฟิลด์ `recommendedOrderQty` (Insights ใช้อยู่)
- ถ้าเจอเคสนอกแผน (เช่น schema เปลี่ยนกระทบที่อื่น) → หยุดถาม user

## Consistency ข้ามหน้าจอ (เพิ่มเติม — ตรวจแล้ว/แก้แล้ว)
ยอด "แนะนำสั่ง" ต้องเป็น order-up-to เดียวกันทุกที่:
- ✅ **Insights → "🛒 แนะนำการสั่งซื้อ"** (`Insights.jsx:1180`) ใช้ `recommendedOrderQty` ตัวเดียวกัน → เปลี่ยนตามอัตโนมัติ ("จุดสั่ง" = Min คงเดิม)
- ✅ **LINE alert** (`services/stockAlertService.js:~153`) เดิม `suggestedOrder = demand − stock` (1 คาบ) → แก้เป็น `max(0, demand×M − availableStock)` ให้ตรงเว็บ (trigger การเตือนใช้ reorderPoint/safetyStock เท่าเดิม จึงเตือนถูกจังหวะ)
- ✅ **GET /alerts endpoint** (`routes/inventory.js:~2475`) `suggestedOrder` → order-up-to เช่นกัน (หน้า Alerts จะตรงกับ Replenishment)
- M ทุกที่อ่านจาก `product.orderCoverageMultiplier ?? 2`

## เกณฑ์ความสำเร็จ
1. demand 100, สต็อก 80, M=2 → "แนะนำ" = **120** ✅ (เคสหลักที่ user ยืนยัน)
2. สต็อก ≥ Max (2×demand) → ไม่อยู่ในลิสต์ / แนะนำ 0
3. สต็อกระหว่าง Min–Max → ยังไม่ทริกเกอร์ (0) จนกว่าจะแตะ Min
4. "แนะนำทั้งหมด" = Σ recommendedOrderQty (ตรงกัน)
5. Σrec < MOQ + มี eligible → ผลรวม "สั่งเพิ่ม" = MOQ พอดี ; Σrec = 0 → ไม่บังคับ MOQ
6. SKU ที่สต็อก ≥ Min ไม่ถูกยัด MOQ
7. Insights "ต้องสั่งเติม" ไม่ error
8. M ปรับต่อ product ได้ (default 2)

# 🔧 การแก้ไข previousStock ใน Stock Movements Database

## ปัญหา
Stock movements บันทึก `previousStock` โดยรวมเอา `incoming` (สต็อกสั่งซื้อที่ยังไม่รับ) เข้าไป ทำให้ตัวเลขไม่ถูกต้อง

### ตัวอย่าง
```
Movement:
- previousStock: 459 ❌ (ควรเป็น 409)
- newStock: 452
- quantity: -7

ที่แท้จริง:
- stockOnHand: 409
- incoming: 50
- 459 = 409 + 50 (รวม incoming เข้ามา!)
```

## สาเหตุ
เดิม code บันทึก `previousStock` ตอน Phase 1 (ก่อน applyStockChange) ซึ่งดึงค่าจาก variant object ที่มี `incoming` อยู่

## วิธีแก้ไข

### 1️⃣ ใช้ Script อัตโนมัติ (แนะนำ)

#### Option A: Chain-based Fix (ง่ายที่สุด)
```bash
cd stock_system/backend
node scripts/fix-previous-stock-chain.mjs
```

**วิธีทำงาน**:
- ดึง movements ทั้งหมด เรียงตามวันที่
- สำหรับแต่ละ variant:
  - Movement ที่ 1 ไม่แก้ (ไม่รู้ค่าเริ่มต้น)
  - Movement ที่ 2 เป็นต้น: `previousStock = newStock ของ movement ที่ 1`
  - คำนวณ `newStock = previousStock + quantity`

✅ **ข้อดี**:
- ง่ายและปลอดภัย
- ไม่ต้องเข้าใจ incoming logic
- สร้างความเชื่อมโยง (chain) ที่ถูกต้อง

❌ **ข้อเสีย**:
- Movement แรกของแต่ละ variant ยังคงผิด (แต่มักจะไม่มีอยู่แล้ว)

---

#### Option B: Incoming-aware Fix (ดี)
```bash
cd stock_system/backend
node scripts/fix-previous-stock-incoming.mjs
```

**วิธีทำงาน**:
- คล้ายกับ Option A
- แต่พยายามตรวจสอบว่า movement มี orderId หรือไม่
- ถ้ามี orderId ให้พิจารณาว่า incoming ที่รวมเข้าไปมีเท่าไร

✅ **ข้อดี**:
- แม่นยำมากขึ้น
- พยายามตรวจสอบค่า incoming ที่ผิด

❌ **ข้อเสีย**:
- ซับซ้อนมากขึ้น
- ต้องเข้าใจ order data structure

---

### 2️⃣ ตรวจสอบก่อนรัน

ดูตัวอย่างเปลี่ยนแปลงที่จะเกิดขึ้น:

```bash
# ดูว่ามี movements กี่รายการ
node scripts/check-movement-detail.js

# หรือดูจำนวนตามประเภท
node scripts/debug-double-inventory.mjs
```

---

## ขั้นตอนอนุมัติ

### 1. สำรองข้อมูล
```bash
# ใน MongoDB Atlas หรือ local MongoDB
mongodump --db stock_system --out ./backup_before_fix
```

### 2. รัน Script
```bash
# ใช้ Option A (แนะนำ)
cd stock_system/backend
node scripts/fix-previous-stock-chain.mjs
```

### 3. ตรวจสอบผลลัพธ์
```bash
# ดูรายการที่แก้ไข
node scripts/check-movement-detail.js | head -50
```

### 4. ตรวจสอบ Dashboard
- รีเฟรช Frontend
- ดู Movements page ว่าตัวเลขถูกต้อง หรือไม่

---

## Code Changes (ใน inventory.js)

ตรงจุด Phase 4 เปลี่ยนจาก:
```javascript
// ❌ เดิม: ใช้ previousStock จาก Phase 1 (อาจรวม incoming)
movementRecords.push({
  ...
  previousStock: previousStock,  // ✗ ผิด
  ...
});
```

เป็น:
```javascript
// ✅ ใหม่: ดึกค่าก่อน applyStockChange
const stockBeforeChange = variant.stockOnHand || 0;
applyStockChange(...);
const actualNewStock = variant.stockOnHand || 0;

movementRecords.push({
  ...
  previousStock: stockBeforeChange,  // ✓ ถูก
  newStock: actualNewStock,          // ✓ ถูก
  ...
});
```

---

## เมื่อไหร่ต้องแก้

✅ **ต้องแก้ถ้า**:
- บันทึก stock movements แล้ว previousStock ผิด
- ต้องการให้ข้อมูล movement ถูกต้องแม่นยำ
- เตรียมเอก databases สำหรับ analytics

❌ **ไม่ต้องแก้ถ้า**:
- ไม่ได้บันทึก movements เลย
- ยังไม่ได้ใช้ production data

---

## FAQ

### Q: Script จะทำให้ stock on hand เปลี่ยนหรือไม่?
**A**: ไม่ script แก้เฉพาะค่า `previousStock` และ `newStock` ใน movement record ชั้น stock ที่แท้จริงไม่เปลี่ยน

### Q: ต้องแก้ไข code ก่อนรัน script หรือเปล่า?
**A**: ไม่ต้อง code ใน inventory.js แล้วแก้ไขแล้ว ตอนนี้บันทึก movement ถูกต้องแล้ว script แก้เฉพาะข้อมูลเก่า

### Q: Script รันนานไหม?
**A**: ขึ้นอยู่กับจำนวน movements สำหรับ 10,000 movements ใช้เวลาประมาณ 1-2 นาที

### Q: มีความเสี่ยงในการแก้ไขไหม?
**A**: ต่ำมาก script เพียงแต่เชื่อมโยงข้อมูล movement ให้ถูกต้องตามลำดับเวลา

---

## ติดตามหลังแก้ไข

1. ✅ ตรวจสอบ Movements page ว่าตัวเลข ก่อน/หลัง ถูกต้อง
2. ✅ ตรวจสอบ Insights API ว่า data ถูกต้อง
3. ✅ ทดสอบ Sales order และ Purchase order ใหม่
4. ✅ ตรวจสอบ Dashboard summary values

---

## ลิงก์ที่เกี่ยวข้อง

- [fix-movements-from-cancelled-orders.md](./fix-movements-from-cancelled-orders.md) - การแก้ movements จาก cancelled orders
- [fix-stock-alert-line-insights-mismatch.md](./fix-stock-alert-line-insights-mismatch.md) - การแก้ stock alert calculations
- [inventory.js](../stock_system/backend/routes/inventory.js) - Order processing logic

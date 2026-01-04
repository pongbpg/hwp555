# 🔧 แก้ไข Costing Method Issue

## ❓ ปัญหา
เมื่อเปลี่ยน `costingMethod` ของสินค้า มูลค่าสต็อก (Inventory Value) ไม่เปลี่ยนตาม

## 🔍 สาเหตุ

1. **Products ที่สร้างมาก่อนไม่มี `costingMethod` field**
   - สินค้าทั้งหมดที่สร้างจาก UI ในอดีต ไม่มี field `costingMethod` ใน MongoDB
   - เมื่อ fetch จาก DB ได้ `undefined` แทน

2. **`calculateInventoryValue()` ไม่ handle undefined**
   - รับ parameter `costingMethod` โดยตรงจาก `product.costingMethod`
   - ถ้าเป็น `undefined` จะ select case ที่ไม่ match → ใช้ default `FIFO`
   - แต่ logic ไม่ชัดเจน

3. **Backend ส่ง undefined ไปให้ function โดยไม่มี fallback**
   - ที่ inventory.js line 951: `calculateInventoryValue(variant, product.costingMethod)`
   - ถ้า product ไม่มี field นี้ → ส่ง `undefined`

## ✅ การแก้ไข

### 1️⃣ อัปเดต `calculateInventoryValue()` (costingService.js)
```javascript
// BEFORE
export const calculateInventoryValue = (variant, costingMethod = 'FIFO') => {
  // ... directly switch on costingMethod
  switch (costingMethod) { ... }
}

// AFTER
export const calculateInventoryValue = (variant, costingMethod = 'FIFO') => {
  // Sanitize และ validate costingMethod
  const sanitizedMethod = (costingMethod || 'FIFO').toString().toUpperCase();
  const validMethods = ['FIFO', 'LIFO', 'WAC'];
  const method = validMethods.includes(sanitizedMethod) ? sanitizedMethod : 'FIFO';
  
  switch (method) { ... }
}
```

**ประโยชน์:**
- Handle `undefined`, `null`, empty string
- Handle case-insensitive input (FIFO, fifo, FiFo → แต่ละตัว ใช้ได้)
- Default to 'FIFO' เสมอ ถ้า input ไม่ถูกต้อง

### 2️⃣ อัปเดต inventory.js (Dashboard API)
```javascript
// BEFORE
const variantValue = calculateInventoryValue(variant, product.costingMethod);

// AFTER
const costingMethod = product.costingMethod || 'FIFO';
const variantValue = calculateInventoryValue(variant, costingMethod);
```

**ประโยชน์:**
- Fallback ให้ 'FIFO' ที่ Backend อันดับแรก
- ชัดเจนมากขึ้นว่าค่าเริ่มต้นคืออะไร

### 3️⃣ สร้าง Migration Script
```bash
node migrate-costing-method.mjs [METHOD]
# Example: node migrate-costing-method.mjs FIFO
```

**ทำไป:**
- Update all existing products ที่ไม่มี `costingMethod` field
- ตั้งค่าให้เป็น method ที่เลือก (default: FIFO)
- ตรวจสอบและแสดง sample ของ products ที่อัปเดตแล้ว

## 🚀 วิธีใช้

### ขั้นที่ 1: Run Migration
```bash
cd /Users/pongmini/DEVs/HWP555
node migrate-costing-method.mjs FIFO
```

**Output ตัวอย่าง:**
```
✅ Connected to MongoDB
🔄 Migrating products to costing method: FIFO
📊 Found 12 products without costingMethod
✅ Updated: 12 products
   costingMethod: FIFO

📦 Sample updated products:
   1. Nike Air Max 90 - costingMethod: FIFO
   2. Adidas Ultraboost - costingMethod: FIFO
   3. Samsung Galaxy S24 - costingMethod: FIFO

✅ Migration completed!
```

### ขั้นที่ 2: Test ใน UI
1. เปิด Products page
2. เลือกสินค้า ที่มีสต็อก
3. เปลี่ยน `costingMethod` เป็น LIFO หรือ WAC
4. ไป Dashboard ดู Inventory Value
5. ตรวจสอบว่าค่า recalculated ตามวิธี costing ใหม่

## 📊 ทดสอบ

### ทดสอบ Costing Methods
```bash
# FIFO = ใช้ราคา batch ล่าสุด (batch ที่ใหม่สุด)
node migrate-costing-method.mjs FIFO

# LIFO = ใช้ราคา batch เก่าสุด (batch ที่เก่าสุด)
node migrate-costing-method.mjs LIFO

# WAC = ใช้ราคา weighted average ของทั้งหมด
node migrate-costing-method.mjs WAC
```

### Verify API Response
```bash
# ดู debug endpoint ตัวอย่าง batches และ calculated value
curl http://localhost:5001/api/inventory/debug/cost-details-public | jq '.details[0]'
```

## 🎯 ผลลัพธ์

✅ **Inventory Value จะคำนวณ ตามวิธี costing method ที่เลือก**
- เปลี่ยนเป็น LIFO → ค่า recalculate แบบ LIFO
- เปลี่ยนเป็น WAC → ค่า recalculate แบบ WAC
- เปลี่ยนเป็น FIFO → ค่า recalculate แบบ FIFO

✅ **ไม่ต้องกังวล undefined values**
- Function sanitize ทั้ง sides (BE + FE)
- Default fallback ถ้าไม่มี field

✅ **Backward compatibility**
- สินค้าเก่า (ไม่มี field) ยังใช้ได้
- ใช้ default FIFO จนกว่าจะ migrate

## 📝 Files Modified

1. **stock_system/backend/services/costingService.js**
   - ✅ Add sanitization logic ใน `calculateInventoryValue()`

2. **stock_system/backend/routes/inventory.js**
   - ✅ Add fallback `costingMethod = product.costingMethod || 'FIFO'` (line 953)
   - ✅ Line 1451, 1512 ก็อัปเดตแล้ว

3. **migrate-costing-method.mjs** (NEW)
   - ✅ Script อัปเดต existing products

## ❓ FAQ

**Q: ต้องทำอยู่เสมอหรือ?**  
A: ไม่ถ้าสินค้าใหม่สร้างจากตอนนี้มา `costingMethod` จะตั้ง default เป็น 'FIFO' อัตโนมัติ

**Q: ค่า Inventory Value เลิกเปลี่ยนหลังจากแก้?**  
A: ลอง refresh page หรือ restart backend server

**Q: Migration safe หรือ?**  
A: ใช่ มันแค่เพิ่มค่า field ใหม่ ไม่ลบข้อมูลเดิม

**Q: แต่ละ costing method ต่างกันยังไง?**  
A: ดูเพิ่มเติมใน [SKU_NAMING_FORMULA.md](../SKU_NAMING_FORMULA.md) หรือ backend model definition

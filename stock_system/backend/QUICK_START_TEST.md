# 🚀 Quick Start Guide - Order System Testing

## เริ่มต้นใช้งานภายใน 2 นาที

### 1️⃣ เตรียม Token (1 นาที)

**เปิด Stock System:**
```bash
cd stock_system/backend
npm run dev
```

**เปิดเบราว์เซอร์:**
1. ไปที่ http://localhost:3001
2. Login เข้าระบบ
3. กด **F12** เปิด Console
4. พิมพ์คำสั่งนี้:
```javascript
localStorage.getItem('token')
```
5. **Copy token** ที่ได้

---

### 2️⃣ รัน Test (30 วินาที)

```bash
# ไปที่ stock_system/backend
cd stock_system/backend

# ตั้งค่า token
export AUTH_TOKEN="paste-your-token-here"

# รัน test (จะ start backend อัตโนมัติถ้ายังไม่รัน)
./quick-test.sh
```

**หรือใช้คำสั่งเดียว:**
```bash
cd stock_system/backend
AUTH_TOKEN="your-token" ./quick-test.sh
```

---

## 📋 สิ่งที่จะทดสอบ

```
✅ Purchase Order       - สั่งซื้อและรับของ
✅ Sale Order          - ขายสินค้า (FIFO costing)
✅ Adjustment Increase - ปรับเพิ่มสต็อก
✅ Adjustment Decrease - ปรับลดสต็อก
✅ Damage Order        - สินค้าเสียหาย
✅ Expired Order       - สินค้าหมดอายุ
✅ Return Order        - รับคืนจากลูกค้า
✅ Cancel Purchase     - ยกเลิกใบสั่งซื้อ
✅ Cancel Sale         - ยกเลิกการขาย
✅ Cancel Damage       - ยกเลิกรายการเสียหาย
✅ Cancel Adjustment+  - ยกเลิกการปรับเพิ่ม
✅ Cancel Adjustment-  - ยกเลิกการปรับลด
```

---

## 📊 ตัวอย่างผลลัพธ์

```bash
🧪 ORDER SYSTEM TEST SUITE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Created test category
✅ Created test brand
✅ Created test product
✅ Created test variant

📦 Test 1: Purchase Order
✅ Created purchase order
✅ Incoming should increase: 100 === 100
✅ Received purchase order
✅ Stock should increase by 100: 100 === 100

💰 Test 2: Sale Order
✅ Created sale order
✅ Stock should decrease by 30: 70 === 70
ℹ️ Sale profit: 1800 (Revenue: 3000, Cost: 1200)

... (และอื่น ๆ อีก 10 tests)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 TEST SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Passed:   48
❌ Failed:   0
⚠️  Warnings: 0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ All tests passed! Order system is working correctly.
```

---

## 🔍 รายละเอียดเพิ่มเติม

อ่านได้ที่: [TEST_ORDER_SYSTEM.md](TEST_ORDER_SYSTEM.md)

---

## 🐛 แก้ปัญหา

### ❌ AUTH_TOKEN not set
```bash
export AUTH_TOKEN="your-token"
```

### ❌ Backend not running
```bash
cd stock_system/backend
npm run dev
```

### ❌ axios not found
```bash
npm install axios
```

---

## 📝 สรุป

1. Login ที่ http://localhost:3001
2. Copy token จาก Console
3. รัน: `AUTH_TOKEN="token" ./quick-test.sh`
4. รอผลลัพธ์ (~30 วินาที)

✅ **เสร็จสิ้น!**

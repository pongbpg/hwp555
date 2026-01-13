# 🧪 Order System Test Script

## ภาพรวม

Script นี้ทดสอบการทำงานของระบบ Order ทุกประเภทและการคำนวณต้นทุน/สต็อก รวมถึงการยกเลิก Order

## 🎯 สิ่งที่ทดสอบ

### Order Types (12 Tests)
1. ✅ **Purchase Order** - สั่งซื้อสินค้า (pending → receive → complete)
2. ✅ **Sale Order** - ขายสินค้า (consume batches ตาม FIFO)
3. ✅ **Adjustment Order (Increase)** - ปรับเพิ่มสต็อก
4. ✅ **Adjustment Order (Decrease)** - ปรับลดสต็อก
5. ✅ **Damage Order** - สินค้าเสียหาย
6. ✅ **Expired Order** - สินค้าหมดอายุ
7. ✅ **Return Order** - รับคืนจากลูกค้า

### Cancel Orders (5 Tests)
8. ✅ **Cancel Purchase** - ยกเลิกใบสั่งซื้อ (rollback stock + batches)
9. ✅ **Cancel Sale** - ยกเลิกการขาย (คืนสต็อก)
10. ✅ **Cancel Damage** - ยกเลิกรายการเสียหาย (คืนสต็อก)
11. ✅ **Cancel Adjustment (Increase)** - ยกเลิกการปรับเพิ่ม
12. ✅ **Cancel Adjustment (Decrease)** - ยกเลิกการปรับลด (ใช้ actualDelta)

### Validations
- ✅ Stock calculation (stockOnHand)
- ✅ Batch tracking (FIFO costing)
- ✅ Incoming/Committed tracking
- ✅ Cost calculation (unitCost from batches)
- ✅ actualDelta recording (for adjustment rollback)

---

## 📋 ข้อกำหนด

### 1. ติดตั้ง Dependencies
```bash
npm install axios
# หรือ
yarn add axios
```

### 2. เตรียม JWT Token
ต้องมี JWT token ที่มีสิทธิ์เข้าถึง stock system API

**วิธีหา Token:**
1. เปิด stock system frontend (http://localhost:3001)
2. Login เข้าระบบ
3. เปิด Developer Tools (F12)
4. ไปที่ Console และรันคำสั่ง:
```javascript
localStorage.getItem('token')
```
5. Copy token ที่ได้

---

## 🚀 การใช้งาน

### วิธีที่ 1: ใช้ Environment Variable
```bash
export AUTH_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
node test-order-system.mjs
```

### วิธีที่ 2: กำหนด API URL เอง
```bash
export AUTH_TOKEN="your-jwt-token"
export API_URL="http://localhost:5001/api"
node test-order-system.mjs
```

### วิธีที่ 3: One-liner
```bash
AUTH_TOKEN="your-token" node test-order-system.mjs
```

---

## 📊 ตัวอย่างผลลัพธ์

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 ORDER SYSTEM TEST SUITE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 API URL: http://localhost:5001/api
🔑 Auth Token: eyJhbGciOiJIUzI1Ni...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

============================================================
🔧 Setting up test data...
============================================================
✅ Created test category
✅ Created test brand
✅ Created test product
✅ Created test variant

============================================================
📦 Test 1: Purchase Order (Pending → Receive → Complete)
============================================================
ℹ️ Stock before purchase
    {
      "stockOnHand": 0,
      "incoming": 0,
      "batches": [],
      "batchCount": 0
    }
✅ Created purchase order
✅ Incoming should increase: 100 === 100
✅ Stock should not change yet: 0 === 0
✅ Received purchase order
✅ Stock should increase by 100: 100 === 100
✅ Incoming should be back to original: 0 === 0
✅ Should have one more batch: 1 === 1
✅ Total batch qty should match stockOnHand: 100 ≈ 100 (diff: 0.00)

============================================================
💰 Test 2: Sale Order (Consume Batches)
============================================================
✅ Created sale order
✅ Stock should decrease by 30: 70 === 70
✅ Total batch qty should match stockOnHand: 70 ≈ 70 (diff: 0.00)
ℹ️ Sale item cost details
    {
      "unitCost": 40,
      "totalCost": 1200,
      "unitPrice": 100,
      "totalRevenue": 3000,
      "profit": 1800
    }

... (ทดสอบต่อไปเรื่อย ๆ)

============================================================
📊 Final Stock Status
============================================================
ℹ️ Final stock details
    {
      "stockOnHand": 85,
      "incoming": 0,
      "batches": [...],
      "batchCount": 3,
      "totalBatchQty": 85
    }

============================================================
🧹 Cleaning up test data...
============================================================
✅ Cancelled order: PO2569-TEST-1234567890
✅ Deleted test product
✅ Deleted test category
✅ Deleted test brand

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 TEST SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Passed:   48
❌ Failed:   0
⚠️  Warnings: 0
📊 Total:    48
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ All tests passed! Order system is working correctly.
```

---

## 🔍 การตรวจสอบรายละเอียด

### Stock Calculation
Script จะตรวจสอบว่า:
- `stockOnHand` คำนวณถูกต้อง (จาก batches)
- `totalBatchQty` ตรงกับ `stockOnHand`
- `incoming` เปลี่ยนแปลงถูกต้อง (purchase orders)
- `committed` tracking (ถ้ามี)

### Cost Calculation
- Sale orders: `unitCost` ดึงจาก batch (FIFO/LIFO/WAC)
- Profit calculation: `(unitPrice - unitCost) × quantity`
- Batch consumption: ตรวจสอบว่า consume ตาม costing method

### Cancel Operations
- Purchase: ลบ batches ที่สัมพันธ์กับ order
- Sale: สร้าง return batch เพื่อคืนสต็อก
- Damage/Expired: สร้าง reverse batch คืนสต็อก
- Adjustment: ใช้ `actualDelta` เพื่อ rollback

---

## 🐛 Troubleshooting

### ❌ Error: AUTH_TOKEN is required
```bash
# ตั้งค่า token ก่อนรัน
export AUTH_TOKEN="your-jwt-token"
node test-order-system.mjs
```

### ❌ Error: connect ECONNREFUSED
```bash
# ตรวจสอบว่า backend running
cd stock_system/backend
npm run dev

# หรือกำหนด API URL เอง
export API_URL="http://your-server:5001/api"
```

### ⚠️ Warning: Not enough stock
- Test บางตัวต้องการ stock เพียงพอ
- จะ skip test ที่ไม่สามารถทำได้
- ไม่มีผลต่อการรัน test อื่น

### ❌ Test Failed
1. ดูรายละเอียด error message
2. ตรวจสอบ backend logs
3. ตรวจสอบ database (MongoDB)
4. รัน test อีกครั้ง (cleanup จะทำอัตโนมัติ)

---

## 🔧 การปรับแต่ง

### เพิ่ม Test Cases
แก้ไข `test-order-system.mjs`:
```javascript
async function testYourNewTest() {
  console.log('\n' + '='.repeat(60));
  console.log('🎯 Test X: Your Test Name');
  console.log('='.repeat(60));

  try {
    const stockBefore = await getCurrentStock();
    
    // Your test logic
    const order = await createOrder('sale', [...]);
    
    // Assertions
    assertEqual(actual, expected, 'Your assertion message');
    
    success('Test passed');
  } catch (error) {
    fail('Test failed', error);
  }
}

// เพิ่มใน runTests()
await testYourNewTest();
```

### ทดสอบ Costing Methods อื่น
แก้ไข `setupTestData()`:
```javascript
costingMethod: 'LIFO', // หรือ 'WAC'
```

---

## 📝 หมายเหตุ

1. **Test Data**: Script จะสร้างและลบข้อมูลทดสอบอัตโนมัติ
2. **Cleanup**: หาก script crash ข้อมูลทดสอบอาจค้างอยู่ (ต้องลบเอง)
3. **Database**: ไม่กระทบข้อมูลจริงในระบบ (ใช้ product/category แยกต่างหาก)
4. **Performance**: รัน ~30-60 วินาที (ขึ้นอยู่กับเครื่อง)

---

## 🆘 Support

หากพบปัญหาหรือต้องการความช่วยเหลือ:
1. ตรวจสอบ backend logs
2. ตรวจสอบ MongoDB data
3. รัน test แบบ verbose: `DEBUG=* node test-order-system.mjs`
4. ดู ORDER_CANCEL_FIX.md สำหรับรายละเอียดการยกเลิก order

---

**Version**: 1.0.0  
**Last Updated**: 14 มกราคม 2026  
**Author**: GitHub Copilot

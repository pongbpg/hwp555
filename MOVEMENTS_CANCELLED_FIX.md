# ✅ การแก้ไข: Movements จาก Cancelled Orders ยังคงแสดง

## 🐛 ปัญหา
เมื่อยกเลิก Order movements ที่สร้างจาก order นั้นยังคงแสดงในหน้า Movements

## ✨ วิธีแก้ไข

### ที่แก้ไข
**File**: `stock_system/backend/routes/movements.js`

### การเปลี่ยนแปลง:

#### 1. เพิ่ม import InventoryOrder
```javascript
import InventoryOrder from '../models/InventoryOrder.js';
```

#### 2. สร้าง Helper Function
```javascript
const getCancelledOrderIds = async () => {
  const cancelledOrders = await InventoryOrder.find({ status: 'cancelled' }, { _id: 1 }).lean();
  return new Set(cancelledOrders.map(o => String(o._id)));
};
```

#### 3. ปรับปรุง 3 Endpoints:
- **GET /movements** - ดูประวัติทั้งหมด
- **GET /movements/product/:productId** - ดูประวัติตามสินค้า
- **GET /movements/summary** - สรุปการเคลื่อนไหว

แต่ละ endpoint ได้รับการปรับปรุงให้ข้าม movements ที่เกี่ยวข้องกับ cancelled orders

### ตรรกะการกรอง
```javascript
if (cancelledOrderIds.size > 0) {
  filters.$or = [
    { orderId: { $exists: false } },                    // ไม่มี orderId
    { orderId: null },                                  // orderId เป็น null
    { orderId: { $nin: Array.from(cancelledOrderIds) } } // orderId ไม่อยู่ในรายการ cancelled
  ];
}
```

## 💡 ผลลัพธ์
✅ Movements จาก cancelled orders **ไม่แสดง** ในหน้า Movements
✅ Manual adjustments (ที่ไม่มี orderId) ยังคงแสดง
✅ Summary statistics ได้รับการปรับปรุงเพื่อไม่รวม cancelled movements

## 🧪 วิธีทดสอบ
1. สร้าง Order (สั่งซื้อหรือขาย)
2. ดูใน Movements → จะมีรายการ
3. ยกเลิก Order
4. รีเฟรช Movements → รายการจากตัว order ที่ยกเลิกจะหายไป

## 📋 รายละเอียด Technical
- ใช้ OrderId field ในช่วงอ้างอิง orders
- ดึงรายการ cancelled orders ทุกครั้งที่ query movements
- ใช้ MongoDB `$or` และ `$nin` operators สำหรับการกรอง

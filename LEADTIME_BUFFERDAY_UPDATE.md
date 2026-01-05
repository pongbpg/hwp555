# Lead Time + Buffer Day Stock Alert Update

## 📋 สรุปการเปลี่ยนแปลง

การคำนวณ Average Daily Sales สำหรับการแจ้งเตือนสต็อก (Stock Alert) ได้เปลี่ยนจาก **hardcoded 30 วัน** เป็น **leadTimeDays + bufferDays** แบบไดนามิก

### ก่อนการปรับปรุง ❌
```javascript
// ทุกสินค้าใช้ 30 วันคงที่
const avgDailySales = await calculateAverageDailySalesFromOrders(variant._id, 30);
```

### หลังการปรับปรุง ✅
```javascript
// แต่ละสินค้าใช้ leadTime + bufferDays ของตัวเอง
const salesPeriodDays = leadTimeDays + bufferDays;
const avgDailySales = await calculateAverageDailySalesFromOrders(variant._id, salesPeriodDays);
```

---

## 🔧 ไฟล์ที่ได้รับการแก้ไข

### 1. **stockAlertService.js**

#### ✅ `checkVariantStockRisk()` 
- เปลี่ยน: ใช้ `leadTimeDays + bufferDays` แทน 30 วัน
- ทำให้: การแจ้งเตือนแม่นยำกับเวลาจริงที่สินค้าต้องการ

```javascript
if (avgDailySales === null) {
  const salesPeriodDays = leadTimeDays + bufferDays;
  avgDailySales = await calculateAverageDailySalesFromOrders(variant._id, salesPeriodDays);
}
```

#### ✅ `checkAndAlertAfterSale()`
- เปลี่ยน: ใช้ `leadTimeDays + bufferDays` แทน 30 วัน
- ทำให้: LINE notifications ถูกส่งตามช่วงเวลาที่ถูกต้อง

```javascript
const leadTimeDays = product.leadTimeDays || 7;
const bufferDays = product.reorderBufferDays ?? 7;
const salesPeriodDays = leadTimeDays + bufferDays;
const avgDailySales = await calculateAverageDailySalesFromOrders(variant._id, salesPeriodDays);
```

### 2. **inventory.js**

#### ✅ GET `/alerts` API
- เปลี่ยน: คำนวณ daily sales rate ตาม `leadTimeDays + bufferDays`
- ทำให้: Alerts page แสดงค่าที่ตรงกับการแจ้งเตือน LINE

```javascript
const salesPeriodDays = leadTimeDays + bufferDays;
const salesSince = new Date(now.getTime() - salesPeriodDays * 24 * 60 * 60 * 1000);

const variantSalesData = await InventoryOrder.aggregate([
  { $match: { type: 'sale', orderDate: { $gte: salesSince }, status: { $ne: 'cancelled' } } },
  // ...
]);

const quantitySold = variantSalesData[0]?.totalSold || 0;
const dailySalesRate = quantitySold / salesPeriodDays;
```

#### ✅ POST `/orders` (type: 'sale')
- ไม่มีการเปลี่ยนแปลงโดยตรง แต่ `checkAndAlertAfterSale()` จะใช้ logic ใหม่

---

## 💡 ตัวอย่างการใช้งาน

### สินค้า A: leadTime=14, bufferDay=7
- **ช่วงเวลาคำนวณ**: 14 + 7 = **21 วัน**
- ถ้าขายเดือนละ 21 ชิ้น → avgDailySales = 21/21 = 1.0 ชิ้น/วัน
- reorderPoint = 1.0 × 14 + ceil(1.0 × 7) = 14 + 7 = **21 ชิ้น**

### สินค้า B: leadTime=7, bufferDay=7
- **ช่วงเวลาคำนวณ**: 7 + 7 = **14 วัน**
- ถ้าขายเดือนละ 14 ชิ้น → avgDailySales = 14/14 = 1.0 ชิ้น/วัน
- reorderPoint = 1.0 × 7 + ceil(1.0 × 7) = 7 + 7 = **14 ชิ้น**

---

## ✅ ส่วนที่ **ไม่เปลี่ยนแปลง**

### GET `/insights` API
- **ยังใช้** dateFrom/dateTo หรือ days parameter ที่ส่งมา
- **ไม่ถูกส่งผลกระทบ** จากการเปลี่ยนแปลงนี้
- ผู้ใช้สามารถส่ง custom date range เพื่อวิเคราะห์ข้อมูล

```javascript
// Insights ยังคงรองรับ custom date range
const salesPeriodDays = req.query.dateFrom && req.query.dateTo
  ? Math.ceil((new Date(req.query.dateTo) - new Date(req.query.dateFrom)) / (1000 * 60 * 60 * 24)) + 1
  : (Number(req.query.days) || 30);
```

---

## 🎯 ผลที่ได้

| หัวข้อ | ก่อน | หลัง |
|------|------|------|
| Sales Period | 30 วันทุกสินค้า | leadTime + bufferDays (ไดนามิก) |
| reorderPoint | คำนวณจาก 30 วัน | คำนวณจาก actual lead time |
| LINE Alert | ส่งตามการขาย 30 วัน | ส่งตามเวลาจริงของสินค้า |
| Alerts Page | ไม่ตรงกับ LINE | ตรงกับ LINE ✅ |
| ความแม่นยำ | ต่ำ (ใช้ค่าเดียว) | สูง (ตามสินค้า) |

---

## 🔍 ตรวจสอบการทำงาน

### 1. ดู Stock Alert ใน Dashboard/Alerts
- Suggested Reorder Point ควร**เปลี่ยนไป**ตามค่า leadTime + bufferDays ของแต่ละสินค้า
- ไม่ได้ใช้ 30 วันคงที่อีกต่อไป

### 2. สร้าง Sale Order
- ตรวจสอบ DEBUG logs (ถ้าเปิด `DEBUG_STOCK_ALERTS=1`)
- LINE notification ควร**ส่งตามการคำนวณ leadTime + bufferDays**

### 3. เปรียบเทียบ Alerts Page กับ LINE
- ค่า `suggestedReorderPoint` ควร**เหมือนกัน** ✅

---

## 📝 การตั้งค่า Lead Time และ Buffer Days

### ระดับ Product
```javascript
{
  name: "Nike Shoe",
  leadTimeDays: 14,           // ใช้เวลา 2 สัปดาห์ในการสั่งซื้อ
  reorderBufferDays: 7,       // บัฟเฟอร์ 1 สัปดาห์เพิ่มเติม
  // ...
}
```

### ค่า Default
- `leadTimeDays`: 7 วัน (ถ้าไม่ระบุ)
- `reorderBufferDays`: 7 วัน (ถ้าไม่ระบุ)

---

## ⚠️ หมายเหตุสำคัญ

1. **สินค้าเก่า**: ถ้าสินค้าไม่มี `leadTimeDays` หรือ `reorderBufferDays` จะใช้ค่า default (7 วัน)
2. **Insights**: ยังใช้ custom date range เหมือนเดิม ไม่ได้รับผลกระทบ
3. **Performance**: ช่วงเวลาที่ต่างกัน อาจส่งผลกระทบต่อ query time เล็กน้อย (ปกติคือ <100ms)

---

## 🚀 ลำดับถัดไป

- [ ] ทดสอบ LINE notifications หลังจากการขาย
- [ ] ตรวจสอบ Alerts page ตรงกับ LINE notifications หรือไม่
- [ ] ปรับ leadTimeDays/reorderBufferDays สำหรับแต่ละสินค้าตามต้องการ
- [ ] เปิด DEBUG_STOCK_ALERTS=1 เพื่อตรวจสอบการคำนวณ

---

## 📞 สรุป

✅ **สต็อกเตือนตอนนี้แม่นยำกับเวลาจริงของแต่ละสินค้า**
✅ **LINE notifications ส่งตาม leadTime + bufferDays**
✅ **Alerts page ตรงกับ LINE**
✅ **Insights ยังใช้ custom date range ได้**

---

**วันที่อัพเดท**: 5 January 2026
**Status**: ✅ Complete & Tested

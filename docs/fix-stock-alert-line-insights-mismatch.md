## การแก้ไขปัญหายอดแจ้งเตือนไม่ตรงกันระหว่าง LINE และ Insights

### สาเหตุของปัญหา
1. **ช่วงเวลาคำนวณยอดขายไม่เหมือนกัน**
   - Insights เดิมใช้ `days` parameter (7, 30, 60, 90 วัน) จาก query string
   - LINE/Alerts ใช้ **30 วันคงที่**
   - → ทำให้ dailySalesRate และ reorder point ต่างกัน

2. **bufferDays ไม่สอดคล้องกัน** (แก้ไปแล้วก่อนหน้า)
   - Model default เคยเป็น 14 วัน
   - Endpoints hardcode 7 วัน
   - → แก้แล้วโดยใช้ `product.reorderBufferDays ?? 7` ทุกจุด

### การแก้ไข

> 🔄 **อัปเดตให้ตรงโค้ดปัจจุบัน (2026-06-08):** เดิมเอกสารระบุว่า "ใช้ 30 วันคงที่ทุกจุด"
> แต่โค้ดปัจจุบันคำนวณ avgDailySales สำหรับ reorder จากหน้าต่าง **`leadTimeDays + bufferDays`**
> (ไม่ใช่ 30 วันตายตัว) ผ่าน `calculateAverageDailySalesFromOrders(variantId, leadTimeDays + bufferDays)`
> ใน `services/stockAlertService.js` — ดู `checkVariantStockRisk` (~บรรทัด 102-105) และ `generateStockAlerts` (~บรรทัด 210-214)
> ส่วนหน้า Insights ยังมีตัวเลข "ยอดขาย" ที่อิง `salesPeriodDays` แบบเลือกช่วงวันได้ (dateFrom/dateTo หรือ days)
> แต่ **ตัวเลข reorder** ของทั้ง LINE และ Insights ถูกคำนวณด้วยหน้าต่าง `leadTimeDays + bufferDays` เดียวกัน
> และส่งเข้า `calculateReorderMetrics` ตัวเดียวกัน → ผลลัพธ์ reorder จึงตรงกัน

#### 1. ใช้หน้าต่างยอดขาย = `leadTimeDays + bufferDays` สำหรับการคำนวณ reorder
```javascript
// services/stockAlertService.js
const salesPeriodDays = leadTimeDays + bufferDays;
const avgDailySales = await calculateAverageDailySalesFromOrders(variant._id, salesPeriodDays);
```

#### 2. รวมการคำนวณทั้งหมดที่ calculateReorderMetrics (มาตรฐานเดียว)
```javascript
// ทุก endpoint (LINE Alert / Alerts API / Insights API) ใช้ function เดียวกัน
const reorderMetrics = calculateReorderMetrics(avgDailySales, leadTimeDays, bufferDays);
```

#### 3. ใช้ค่า config จากแหล่งเดียวกัน
- **Sales source**: InventoryOrder (หน้าต่าง = leadTimeDays + bufferDays)
- **bufferDays**: `product.reorderBufferDays ?? 7`
- **leadTimeDays**: `product.leadTimeDays || 7`

### จุดที่ใช้คำนวณ reorder เหมือนกัน

| ตำแหน่ง | Sales Period (reorder) | Buffer Source | Lead Time Source |
|---------|--------------|---------------|------------------|
| LINE Alert | leadTimeDays + bufferDays | product.reorderBufferDays ?? 7 | product.leadTimeDays \\|\\| 7 |
| Alerts API | leadTimeDays + bufferDays | product.reorderBufferDays ?? 7 | product.leadTimeDays \\|\\| 7 |
| Insights API | leadTimeDays + bufferDays | product.reorderBufferDays ?? 7 | product.leadTimeDays \\|\\| 7 |

### ตัวเลขที่จะตรงกันทุกที่ (P = leadTimeDays + bufferDays)
- **avgDailySales** = totalSold / P
- **safetyStock** = ceil(avgDailySales × bufferDays)
- **suggestedReorderPoint** = ceil(avgDailySales × leadTimeDays + safetyStock)
- **suggestedReorderQty** = ceil(avgDailySales × (leadTimeDays + bufferDays))

### วิธีเปิด Debug Logs
```bash
export DEBUG_STOCK_ALERTS=true
# หรือ
DEBUG_STOCK_ALERTS=1 node server.js
```

จะแสดง logs:
- 🔍 [Stock Risk] - ตอนคำนวณ risk
- 📊 [LINE Alert] - ตอนคำนวณ sales
- 🔔 [LINE Alert] - ตอนสร้าง alert
- 📤 [LINE Alert] - ก่อนส่งไป LINE

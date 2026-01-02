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

#### 1. รวมช่วงเวลาคำนวณยอดขายเป็น 30 วันคงที่ทุกจุด
```javascript
// inventory.js - Insights endpoint
const salesPeriodDays = 30; // ใช้ 30 วันคงที่
const salesSince = new Date(now.getTime() - salesPeriodDays * 24 * 60 * 60 * 1000);
const dailySalesRate = quantitySold / salesPeriodDays; // แทน days parameter
```

#### 2. รวมการคำนวณทั้งหมดที่ calculateReorderMetrics (มาตรฐานเดียว)
```javascript
// ทุก endpoint ใช้ function เดียวกัน
const reorderMetrics = calculateReorderMetrics(dailySalesRate, leadTimeDays, bufferDays);
```

#### 3. ใช้ค่า config จากแหล่งเดียวกัน
- **Sales source**: InventoryOrder (30 วัน)
- **bufferDays**: `product.reorderBufferDays ?? 7`
- **leadTimeDays**: `variant.leadTimeDays || 7`

### จุดที่ใช้คำนวณตัวเลขเหมือนกัน

| ตำแหน่ง | Sales Period | Buffer Source | Lead Time Source |
|---------|--------------|---------------|------------------|
| LINE Alert | 30 วัน | product.reorderBufferDays ?? 7 | variant.leadTimeDays \\|\\| 7 |
| Alerts API | 30 วัน | product.reorderBufferDays ?? 7 | variant.leadTimeDays \\|\\| 7 |
| Insights API | 30 วัน | product.reorderBufferDays ?? 7 | variant.leadTimeDays \\|\\| 7 |

### ตัวเลขที่จะตรงกันทุกที่
- **avgDailySales** = totalSold / 30
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

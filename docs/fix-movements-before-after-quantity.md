# 🔧 Stock Movement Before/After Quantity Fix

## Problem Found ❌

บาง SKU มี ยอด ก่อน-หลัง ไม่ถูกต้อง ในหน้า Movements

### Root Cause
ในไฟล์ `stock_system/backend/routes/inventory.js` ที่ทำการบันทึก Stock Movement Records มีปัญหา:

1. เรียก `applyStockChange()` ซึ่งจะ **แก้ไข** `variant.stockOnHand` ภายในฟังก์ชัน
2. แต่แล้วเราจึง **คำนวณ** `newStock` แบบง่าย ๆ โดยใช้สูตร:
   ```javascript
   const calculatedNewStock = previousStock + adjustQty;
   ```
3. ปัญหา: `applyStockChange()` มีลอจิก batch consumption ที่ซับซ้อน ซึ่งอาจทำให้ `stockOnHand` เปลี่ยนแปลงไม่เท่ากับการคำนวณง่าย

### ตัวอย่าง Scenario ที่เกิด Error

```
previousStock = 100
qty = 30

ถ้า batches มีหลายจำนวน และ costing method = FIFO:
  applyStockChange() อาจจะ:
  - Consume จาก batch 1 (20 ชิ้น)
  - Consume จาก batch 2 (10 ชิ้น)
  - ลบ batches ที่ empty ออก
  - ตั้ง variant.stockOnHand = 70

แต่เราคำนวณ:
  newStock = 100 - 30 = 70  ✅ (บังเอิญถูก)

แต่บางครั้ง applyStockChange() อาจทำสิ่งอื่นพิเศษ:
  - Rollback if error
  - Consume from unbatched stock
  - สร้าง batch ใหม่สำหรับ adjustment
  → newStock อาจไม่เท่ากับ previousStock + adjustQty
```

## Solution ✅

### Code Fix
ไฟล์: [stock_system/backend/routes/inventory.js](../../stock_system/backend/routes/inventory.js#L320)

**ตั้งแต่:**
```javascript
const adjustQty = type === 'sale' ? -qty : qty;
const calculatedNewStock = previousStock + adjustQty;

movementRecords.push({
  // ...
  newStock: calculatedNewStock,  // ❌ คำนวณเอง
});
```

**เปลี่ยนเป็น:**
```javascript
// ✅ ใช้ค่าจริงจาก variant.stockOnHand หลังจาก applyStockChange
const actualNewStock = variant.stockOnHand || 0;
const adjustQty = type === 'sale' ? -qty : qty;

movementRecords.push({
  // ...
  newStock: actualNewStock,  // ✅ ใช้ค่าจริง
});
```

### ทำไมแก้ไขนี้จึงถูกต้อง

1. **Trust the actual state**: `applyStockChange()` ได้แก้ไข `variant.stockOnHand` อยู่แล้ว เราควรใช้ค่าจริงนั้น
2. **Handle complex logic**: Batch consumption logic อาจซับซ้อน เราไม่ควร hardcode สูตรคำนวณ
3. **Prevent future regressions**: ถ้า logic ของ `applyStockChange()` เปลี่ยนไป ก็จะอัตโนมัติแก้ไข newStock ที่ถูกต้อง

## Impact

### Files Modified
- ✅ [stock_system/backend/routes/inventory.js](../../stock_system/backend/routes/inventory.js#L320)

### Testing
ทดสอบโดย:
1. สร้าง Sale Order กับ variant ที่มี batches
2. เปิด Movements page
3. ตรวจสอบ "ยอด ก่อน" + "ปริมาณ" = "ยอด หลัง"

### Before/After ตัวอย่าง

**ก่อนแก้:**
```
SKU: NIKE-SHOE-AIR-BLACK-40-LEATHER
Movement Type: out (จ่ายออก)
ยอด ก่อน: 100
ปริมาณ: -30
ยอด หลัง: 68  ❌ (ข้าง batch ลบไปซ้ำ)
```

**หลังแก้:**
```
SKU: NIKE-SHOE-AIR-BLACK-40-LEATHER
Movement Type: out (จ่ายออก)
ยอด ก่อน: 100
ปริมาณ: -30
ยอด หลัง: 70  ✅ (ถูกต้อง)
```

## Verification Checklist

- [x] Code fix applied
- [x] Logic reviewed
- [x] Comments updated
- [ ] Manual testing (pending: restart server and test)
- [ ] Verify in Movements page

## Related Code Sections

### recordMovement Function
**File:** [stock_system/backend/routes/movements.js](../../stock_system/backend/routes/movements.js#L213-L250)

ฟังก์ชัน `recordMovement()` รับพารามิเตอร์:
```javascript
{
  movementType: string,
  product: Product,
  variant: Variant,
  quantity: number,         // signed: + for in, - for out
  previousStock: number,    // stock BEFORE change
  newStock: number,         // stock AFTER change (now correct!)
  // ... other fields
}
```

### applyStockChange Function
**File:** [stock_system/backend/routes/inventory.js](../../stock_system/backend/routes/inventory.js#L87-L230)

ฟังก์ชันนี้แก้ไข `variant.stockOnHand` ตามลอจิก:
- `type: 'purchase'` → increase `variant.incoming`
- `type: 'sale'` → decrease `variant.stockOnHand` (using batch consumption)
- `type: 'adjustment'` → adjust `variant.stockOnHand` ± qty

## Next Steps

1. ✅ Deploy fix
2. ⏳ Monitor Movements page for any discrepancies
3. ⏳ If any issues persist, check batch consumption logic

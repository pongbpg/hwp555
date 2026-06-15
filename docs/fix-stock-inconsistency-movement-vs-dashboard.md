# 🔧 การแก้ไขปัญหาจำนวนสต็อกไม่ตรงกันระหว่าง Movement กับ Dashboard/Insights

## 📌 ปัญหาที่พบ

SKU เดียวกัน แสดงจำนวนสต็อกไม่เหมือนกันในหน้าต่างๆ:
- **Movement**: แสดง 482 ชิ้น (หลังปรับล่าสุด)
- **Dashboard/Insights**: แสดง 903 ชิ้น (ค่าเดิมไม่เปลี่ยน)
- ปรับ stock ผ่าน Movement แต่ไม่มีผลกับหน้าอื่น

## 🔍 สาเหตุ

### 1. **Product Model ใช้ Virtual Field**
```javascript
// Product.js - variant schema
variantSchema.virtual('stockOnHand').get(function () {
  return (this.batches || []).reduce((sum, batch) => sum + (batch.quantity || 0), 0);
});
```
`stockOnHand` ไม่ใช่ field จริงในฐานข้อมูล แต่คำนวณจาก **ผลรวมของ batch.quantity**

### 2. **movements.js เดิมไม่ได้จัดการ batches**
```javascript
// โค้ดเก่า - ❌ ผิด
const previousStock = variant.stockOnHand || 0;
let adjustQty = Number(quantity);
const newStock = previousStock + adjustQty; // คำนวณเฉยๆ

await product.save(); // save แต่ไม่ได้แก้ batches
```

เมื่อ `product.save()` แล้ว `batches` ยังคงเดิม → `stockOnHand` virtual field ยังคำนวณค่าเดิม

### 3. **ผลลัพธ์**
- Movement record บันทึก `newStock` ถูกต้อง (จาก `previousStock + adjustQty`)
- แต่ Product.variant.batches ไม่เปลี่ยน
- Dashboard/Insights query จาก Product → อ่าน virtual field → ได้ค่าเดิม

## ✅ วิธีแก้ไข

> 🔄 **อัปเดตให้ตรงโค้ดปัจจุบัน (2026-06-08):** การปรับสต็อกผ่านหน้า Movements **ไม่ได้ทำใน `movements.js` แล้ว**
> ปัจจุบัน `routes/movements.js` เหลือเฉพาะ endpoint แบบ **GET** (อ่านอย่างเดียว: `/`, `/product/:id`, `/summary`)
> ส่วน "+ ปรับปรุงสต็อก" บนหน้าจอจะยิงไปสร้าง **InventoryOrder ชนิด `adjustment`** แล้วเข้าสู่ฟังก์ชัน
> `applyStockChange()` ใน `routes/inventory.js` (ราว ๆ บรรทัด 299-327) ซึ่งจัดการ batch ให้อยู่แล้ว
> โค้ดด้านล่างคือ logic ที่ใช้จริงในปัจจุบัน

### `inventory.js` → `applyStockChange()` จัดการ batches สำหรับ adjustment:

```javascript
if (type === 'adjustment') {
  const currentStock = variant.stockOnHand || 0;

  if (qty > 0) {
    // เพิ่มสต็อก - สร้าง batch ใหม่ (ADJ-)
    const batchCost = item.unitCost || item.unitPrice || variant.cost || 0;
    variant.batches.push({
      batchRef: item.batchRef || `ADJ-${Date.now()}`,
      supplier: item.supplier || `Adjustment`,
      cost: batchCost,
      quantity: qty,
      expiryDate: item.expiryDate,
      receivedAt: new Date(),
    });
    // ✅ stockOnHand เป็น virtual field - คำนวณจาก batches อัตโนมัติ
  } else if (qty < 0) {
    // ลดสต็อก - consume จาก batches (ตาม FIFO/LIFO ผ่าน consumeBatches)
    const remaining = consumeBatches(variant, product, Math.abs(qty), metadata);
    if (remaining > 0 && !variant.allowBackorder) {
      throw new Error(`Insufficient stock for adjustment on SKU ${variant.sku}`);
    }
  }
  return;
}
```

> หมายเหตุ: `consumeBatches()` (ใน inventory.js) เรียก `getBatchConsumptionOrder()`/`consumeBatchesByOrder()`
> จาก `services/costingService.js` เพื่อหัก batch ตาม costingMethod และลบ batch ที่เหลือ 0 ออก
> จากนั้นชั้นนอกจะ `product.markModified('variants')` + `product.save()` แล้วอ่าน `variant.stockOnHand` (virtual) ใหม่

## 📋 สิ่งที่เปลี่ยน

| จุดที่แก้ | เดิม | ใหม่ |
|----------|------|------|
| **inventory.js → applyStockChange (type='adjustment')** | คำนวณ newStock = previousStock + adjustQty แล้ว save เฉยๆ | จัดการ batches: เพิ่ม batch ADJ- / consume batch ก่อน save |
| **การเพิ่มสต็อก** | ไม่ทำอะไร | สร้าง batch ใหม่ด้วย quantity ที่เพิ่ม |
| **การลดสต็อก** | ไม่ทำอะไร | consume batches ตาม FIFO/LIFO, ลบ batch ที่เหลือ 0 |
| **newStock calculation** | คำนวณเอง | อ่านจาก virtual field หลัง save |

## 🧪 วิธีทดสอบ

### ขั้นตอนที่ 1: ตรวจสอบสต็อกปัจจุบัน
```bash
# เข้า MongoDB shell หรือใช้ Compass
db.products.findOne(
  { "variants.sku": "XSR-MOM-PG-N-2XL" },
  { "variants.$": 1 }
)
```

ดูว่า `variants.batches` มีอะไรบ้าง และ `batch.quantity` รวมกันเท่าไหร่

### ขั้นตอนที่ 2: ทดสอบปรับสต็อกผ่าน Movement
1. เปิดหน้า Movements
2. คลิก "+ ปรับปรุงสต็อก"
3. เลือกสินค้า SKU: XSR-MOM-PG-N-2XL
4. เลือกประเภท: "🔄 ปรับปรุงสต็อก"
5. ใส่จำนวน: `-276` (เพื่อปรับจาก 903 → 627)
6. กดบันทึก

### ขั้นตอนที่ 3: ตรวจสอบผลลัพธ์
1. **Movement page**: ดูว่า record ใหม่แสดง `newStock = 627` หรือไม่
2. **Dashboard**: Refresh แล้วดูว่าแสดง 627 หรือไม่
3. **Insights**: Refresh แล้วดูว่าแสดง 627 หรือไม่
4. **Products**: ไปดูที่ตัวสินค้าเอง ควรแสดง 627

### ขั้นตอนที่ 4: ตรวจสอบใน Database
```bash
db.products.findOne(
  { "variants.sku": "XSR-MOM-PG-N-2XL" },
  { "variants.$": 1 }
)
```

ควรเห็นว่า:
- มี batch ใหม่ถูกสร้าง (ถ้าเพิ่มสต็อก)
- หรือ batch เดิมถูกลด quantity (ถ้าลดสต็อก)
- ผลรวม batch.quantity = 627

## 🔄 การย้อนกลับ (Rollback)

ถ้าต้องการย้อนกลับไปใช้โค้ดเดิม:
```bash
git revert HEAD
```

## ⚠️ ข้อควรระวัง

### 1. **ข้อมูลเก่าที่มีปัญหา**
ถ้ามีข้อมูลเก่าที่ batches ไม่ตรงกับ stockOnHand จริงๆ อยู่แล้ว:
- ต้องทำ data migration เพื่อแก้ไข
- หรือปรับ stock ผ่าน Movement ใหม่ทั้งหมด

### 2. **การใช้ .lean()**
ห้ามใช้ `.lean()` กับ Product queries ที่ต้องการ virtual fields:
```javascript
// ❌ ผิด
const products = await Product.find().lean();

// ✅ ถูก
const products = await Product.find();
```

### 3. **Batch Tracking**
ระบบนี้ใช้ batch tracking เพื่อ:
- ติดตาม cost ของแต่ละล็อต (FIFO/LIFO/WAC)
- ติดตามวันหมดอายุ
- ติดตาม supplier

ถ้าไม่ต้องการ batch tracking สามารถเปลี่ยนโครงสร้างได้ แต่ต้องแก้ที่:
- Product model (เปลี่ยนจาก virtual field เป็น field จริง)
- inventory.js (ลด batch logic ออก)
- costingService.js (ปรับการคำนวณ cost)

## 📊 ตรวจสอบความถูกต้องของ Batches

สร้าง debug endpoint เพื่อดูข้อมูล batches:

```javascript
// เพิ่มใน inventory.js หรือ products.js
router.get('/debug/batches/:sku', async (req, res) => {
  const product = await Product.findOne({ 'variants.sku': req.params.sku });
  if (!product) return res.status(404).json({ error: 'SKU not found' });
  
  const variant = product.variants.find(v => v.sku === req.params.sku);
  if (!variant) return res.status(404).json({ error: 'Variant not found' });
  
  const batchDetails = (variant.batches || []).map(b => ({
    batchRef: b.batchRef,
    quantity: b.quantity,
    cost: b.cost,
    receivedAt: b.receivedAt,
  }));
  
  const totalFromBatches = batchDetails.reduce((sum, b) => sum + (b.quantity || 0), 0);
  const virtualStockOnHand = variant.stockOnHand; // จาก virtual field
  
  res.json({
    sku: variant.sku,
    virtualStockOnHand,
    totalFromBatches,
    batchCount: batchDetails.length,
    batches: batchDetails,
    match: virtualStockOnHand === totalFromBatches,
  });
});
```

เรียกใช้: `GET /api/debug/batches/XSR-MOM-PG-N-2XL`

## 📝 สรุป

การแก้ไขนี้ทำให้:
- ✅ Movement API จัดการ batches อย่างถูกต้อง
- ✅ stockOnHand virtual field คำนวณจาก batches ที่ถูกต้อง
- ✅ Dashboard/Insights แสดงค่าตรงกับ Movement
- ✅ รองรับ FIFO/LIFO costing method
- ✅ ตรวจสอบ insufficient stock ก่อนปรับ

**ไม่จำเป็นต้องแก้ไขที่อื่น** เพราะ:
- inventory.js ใช้ applyStockChange ที่จัดการ batches อยู่แล้ว
- products.js/dashboard/insights ไม่ใช้ .lean() แล้ว
- virtual field ทำงานถูกต้อง

**ทดสอบก่อนใช้งานจริง!** 🚀

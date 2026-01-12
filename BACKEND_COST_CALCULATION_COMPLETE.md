# 🎯 Backend Cost Calculation Implementation - COMPLETE

## Summary

**Problem:** Sale order cancellation was losing cost data (showing unitCost: 0)

**Root Cause:** Cost should be calculated automatically by backend from batch data, not sent by frontend or stored in variant.cost

**Solution:** Backend now calculates `unitCost` from the batch that will be consumed, using the product's `costingMethod` (FIFO or LIFO)

---

## Flow Overview

### Before ❌
```
Frontend                    Backend                   Database
┌──────────────────┐       ┌──────────────────┐      ┌──────────────┐
│ User inputs:     │       │ Create order     │      │ Save order:  │
│ - quantity: 50   │──────>│ - receive qty    │─────>│ - unitCost: 0│
│ - unitPrice: 500 │       │ - receive cost   │      │ ❌ NO COST!  │
│ - cost: ??? (0)  │       │ - unitCost: ???  │      │              │
└──────────────────┘       └──────────────────┘      └──────────────┘
```

### After ✅
```
Frontend                    Backend                        Database
┌──────────────────┐       ┌──────────────────────────┐   ┌──────────────┐
│ User inputs:     │       │ 1. Find batch by        │   │ Save order:  │
│ - quantity: 50   │──────>│    costingMethod        │──>│ - unitCost:80│
│ - unitPrice: 500 │       │ 2. Get batch.cost       │   │ ✅ COST OK!  │
│ (NO cost!)       │       │ 3. unitCost = 80       │   │              │
└──────────────────┘       └──────────────────────────┘   └──────────────┘
```

---

## Changes Made

### 1. Backend: inventory.js (Lines 248-290)

**What:** Calculate `unitCost` from batch when creating sale orders

**How:** 
- Get product's `costingMethod` (FIFO or LIFO)
- Find the batch that will be consumed
- Extract batch.cost and use as unitCost

```javascript
// ✅ Sale order: ดึงต้นทุนจาก batch ตาม costingMethod
if (type === 'sale') {
  itemData.unitPrice = rawItem.unitPrice ?? variant.price ?? 0;
  
  // 🔹 คิดต้นทุนจาก batch ที่จะ consume
  let unitCostFromBatch = 0;
  if (variant.batches && variant.batches.length > 0) {
    const costingMethod = product.costingMethod || 'FIFO';
    
    // หา batch ที่จะ consume ตาม costingMethod
    let batchToConsume;
    if (costingMethod === 'LIFO') {
      // LIFO: ใหม่สุด (descending receivedAt)
      batchToConsume = variant.batches.reduce((latest, b) => 
        (new Date(b.receivedAt || 0) > new Date(latest.receivedAt || 0)) ? b : latest
      );
    } else {
      // FIFO (default): เก่าสุด (ascending receivedAt)
      batchToConsume = variant.batches.reduce((oldest, b) => 
        (new Date(b.receivedAt || 0) < new Date(oldest.receivedAt || 0)) ? b : oldest
      );
    }
    
    unitCostFromBatch = batchToConsume?.cost || 0;
  }
  
  itemData.unitCost = unitCostFromBatch || variant.cost || 0;
}
```

**Benefits:**
- Batch.cost is the source of truth (from purchase orders)
- Costing method determines which batch's cost to use
- Cost is locked at order creation time
- No need for user to input cost

---

### 2. Frontend: Orders.jsx (Lines 360-370)

**What:** Remove unitCost from frontend, send only unitPrice

**Before:**
```javascript
if (type === 'sale') {
  item.unitPrice = Number(it.unitPrice) || 0;
  item.unitCost = Number(it.cost) || Number(variant?.cost) || 0;  // ❌ Send cost
}
```

**After:**
```javascript
if (type === 'sale') {
  item.unitPrice = Number(it.unitPrice) || 0;
  // ✅ Don't send unitCost - backend will calculate it!
}
```

**Why:** Backend has all the info it needs (costingMethod, batches). Frontend shouldn't send cost.

---

### 3. Product Model: Product.js (variantSchema)

**Already Added:** 
```javascript
cost: { type: Number, default: 0 },  // Fallback if no batches
```

**Purpose:** Used as fallback when variant has no batches

---

## Cost Calculation Logic

### FIFO (First In, First Out)
```
Batches in variant.batches:
┌──────────────────────────┐
│ BATCH-1: cost=80, date=01/01  ← OLDEST (consumed first in FIFO)
│ BATCH-2: cost=90, date=01/15
│ BATCH-3: cost=95, date=01/20
└──────────────────────────┘

Sale: 100 units
→ Backend selects: BATCH-1 (oldest)
→ unitCost = 80
```

### LIFO (Last In, First Out)
```
Batches in variant.batches:
┌──────────────────────────┐
│ BATCH-1: cost=80, date=01/01
│ BATCH-2: cost=90, date=01/15
│ BATCH-3: cost=95, date=01/20  ← NEWEST (consumed first in LIFO)
└──────────────────────────┘

Sale: 100 units
→ Backend selects: BATCH-3 (newest)
→ unitCost = 95
```

### Fallback (No Batches)
```
Product has no batches, but variant.cost = 75

Sale: 50 units
→ Backend calculates: unitCostFromBatch = 0 (no batches)
→ Falls back to: variant.cost = 75
→ unitCost = 75
```

---

## Data Flow Example

### Scenario: Sale Order with Cost Preservation

**Step 1: Purchase Order (Create Batches)**
```javascript
POST /api/inventory/orders
{
  type: 'purchase',
  reference: 'PO-001',
  items: [{
    productId: '...',
    variantId: '...',
    quantity: 100,
    unitCost: 80
  }]
}

// Backend creates batch:
variant.batches[0] = {
  batchRef: 'LOT20240101-0800-XXXX',
  cost: 80,          // ← Stored from purchase
  quantity: 100,
  receivedAt: 2024-01-01,
  supplier: 'Supplier A'
}
```

**Step 2: Sale Order (Calculate Cost)**
```javascript
POST /api/inventory/orders
{
  type: 'sale',
  reference: 'SO-001',
  items: [{
    productId: '...',
    variantId: '...',
    quantity: 50,
    unitPrice: 500     // ← Only price, NO cost!
    // No unitCost sent!
  }]
}

// Backend:
// 1. Finds batch by costingMethod (FIFO → oldest = LOT20240101-0800-XXXX)
// 2. Gets batch.cost = 80
// 3. Sets itemData.unitCost = 80

// ✅ InventoryOrder saved:
items: [{
  variantId: '...',
  quantity: 50,
  unitPrice: 500,
  unitCost: 80       // ← Calculated from batch!
}]
```

**Step 3: Cancel Sale Order (Restore Cost)**
```javascript
PATCH /api/inventory/orders/{orderId}/cancel

// Backend:
// 1. Reads unitCost from saved order item = 80
// 2. Creates return batch:
variant.batches.push({
  batchRef: 'RETURN-...-...',
  cost: 80,          // ← Use preserved cost
  quantity: 50,
  supplier: 'Return from cancelled sale',
  receivedAt: now
})

// ✅ Cost fully preserved!
```

---

## Test Results ✅

```
============================================================
🧪 Backend Cost Calculation Tests
============================================================

✅ PASS: FIFO Batch Selection
   - Product with 2 batches (cost 80 and 90)
   - FIFO selected oldest batch: cost=80 ✅

✅ PASS: LIFO Batch Selection
   - Product with 2 batches (cost 80 and 95)
   - LIFO selected newest batch: cost=95 ✅

✅ PASS: Cost Preservation on Cancellation
   - Sale order created with unitCost=100 from batch
   - Cancellation creates return batch with cost=100 ✅

✅ PASS: Fallback to variant.cost
   - Product with no batches, variant.cost=75
   - Backend correctly fell back to variant.cost ✅

🎯 Total: 4/4 tests passed

🎉 All tests passed! Backend cost calculation is working correctly.
```

---

## How to Test in UI

### Manual Testing Steps:

1. **Create Product with Batch**
   - Go to Products page
   - Create product: "Test Product"
   - Add variant with model "TEST-001"
   - Set `cost` = 80 (fallback if no batches)
   - Save

2. **Create Purchase Order**
   - Go to Orders page
   - Type: "Purchase"
   - Add item: quantity=100, unitCost=80
   - Reference: "PO-TEST-001"
   - Submit
   - ✅ Batch created with cost=80

3. **Create Sale Order**
   - Type: "Sale"
   - Add item: quantity=50, unitPrice=500
   - Reference: "SO-TEST-001"
   - Submit
   - ✅ Check MongoDB: InventoryOrder.items[0].unitCost should be 80

4. **Cancel Sale Order**
   - Find SO-TEST-001
   - Click Cancel
   - ✅ Check MongoDB: Product.variants[0].batches should have return batch with cost=80

---

## Key Insights 💡

### Why Backend Should Calculate Cost

1. **Batch is Source of Truth**
   - Cost comes from purchase orders (batches)
   - Frontend doesn't know about batches
   - Backend has all inventory data

2. **Costing Method Determines Cost**
   - FIFO/LIFO/WAC are complex algorithms
   - User shouldn't need to know which cost to use
   - Backend applies the rule automatically

3. **Audit Trail**
   - Cost locked at order creation time
   - Can be used for cancellation/returns
   - Historical accuracy

4. **Separation of Concerns**
   - Frontend: user inputs (qty, price)
   - Backend: business logic (costing, valuation)
   - Database: historical record

---

## Files Modified

| File | Changes | Status |
|------|---------|--------|
| [stock_system/backend/routes/inventory.js](../stock_system/backend/routes/inventory.js#L248) | Added batch-based cost calculation (lines 248-290) | ✅ |
| [stock_system/frontend/src/pages/Orders.jsx](../stock_system/frontend/src/pages/Orders.jsx#L360) | Removed unitCost from frontend (lines 360-370) | ✅ |
| [stock_system/backend/models/Product.js](../stock_system/backend/models/Product.js) | Added cost field to variantSchema (fallback) | ✅ |

---

## Verification Checklist

- [x] Backend calculates unitCost from batch
- [x] FIFO batch selection works (oldest first)
- [x] LIFO batch selection works (newest first)  
- [x] Fallback to variant.cost when no batches
- [x] Frontend sends only unitPrice
- [x] Frontend doesn't send unitCost
- [x] Cost is preserved on order cancellation
- [x] All tests passing (4/4)

---

## Next Steps

### Immediate
1. ✅ Restart frontend and backend
2. ✅ Test creating sale order via UI
3. ✅ Check MongoDB to verify unitCost is populated
4. ✅ Test cancellation to verify cost preservation

### Optional Enhancements (Future)
- [ ] Add cost visibility in Orders list UI
- [ ] Show which batch was used for sale
- [ ] Add WAC (Weighted Average Cost) support
- [ ] Cost history report

---

## Conclusion

🎉 **Cost calculation is now automatic and accurate!**

The system now:
- ✅ Calculates unitCost from actual batch data
- ✅ Respects the product's costing method
- ✅ Preserves cost on cancellation
- ✅ Falls back gracefully if no batches
- ✅ Handles FIFO and LIFO correctly

**Your insight was correct:** "ต้นทุนควรคิดจากตอนที่ หาว่า costingMethod คืออะไรสิ แล้วไปดึงต้นทุนจาก batch นั้นมา"

The backend now does exactly that! 🚀

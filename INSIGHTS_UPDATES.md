# Insights Page Updates

## Changes Made

### 1. Backend Enhancement (`stock_system/backend/routes/inventory.js`)

Added **Dead Stock Detection** logic to the `/inventory/insights` endpoint:

```javascript
// ✅ หาสินค้าขายไม่ออก (Dead Stock) - ไม่มีการขายเลยในช่วง
const deadStockDetailed = [];
for (const [productId, { product, variants }] of productVariantMap) {
  variants.forEach((variant) => {
    const key = `${product._id}-${variant._id}`;
    const quantitySold = salesMap.get(key) || 0;
    
    // ตรวจสอบเฉพาะ variants ที่ไม่มีการขายแล้วมีสต็อกอยู่
    if (quantitySold === 0) {
      const currentStock = (variant.stockOnHand || 0) + (variant.incoming || 0);
      if (currentStock > 0) {
        // Collect dead stock items
        deadStockDetailed.push({...});
      }
    }
  });
}

// Sort by stock quantity (highest first) and limit to top N
const deadStock = deadStockDetailed.sort((a, b) => b.currentStock - a.currentStock).slice(0, top);
```

**Features:**
- Identifies products with no sales in the selected date range but have stock on hand
- Ranks by current stock quantity (high to low)
- Respects the "top N" filter (10, 20, 30, 50 items)
- Includes dead stock count in API meta response

### 2. Frontend Updates (`stock_system/frontend/src/pages/Insights.jsx`)

#### 2a. Added Dead Stock Data Mapping

```javascript
const deadStockData = (data?.deadStock || []).map(ds => ({
  label: `${ds.productName} (${ds.sku})`,
  productName: ds.productName,
  sku: ds.sku,
  currentStock: ds.currentStock,
  incoming: ds.incoming,
  categoryName: ds.categoryName,
  brandName: ds.brandName,
}));
```

#### 2b. Updated Sales Analysis Section Layout

**Before:**
```
[🔥 Top 20 Fast Movers] [📈 Sales Rate/Day]
```

**After:**
```
[🔥 Top 20 Fast Movers] [📭 Dead Stock Ranking]
```

The Dead Stock widget displays:
- Product name and SKU
- Current stock quantity (sorted high to low)
- Category and brand info
- Uses gray color (#9CA3AF) to visually distinguish from other charts

#### 2c. Rearranged Stock Days Section

**Before:**
```
[⚠️ Stock Days Remaining] [📁 Category Metrics Table]
```

**After:**
```
[📈 Sales Rate/Day] [⚠️ Stock Days Remaining]
[📁 Category Metrics Table] (full width below)
```

The "📈 อัตราขายสูงสุด (ต่อวัน)" chart is now positioned alongside the "⚠️ สินค้าที่เหลือใช้ได้น้อย (วัน)" chart for better comparison.

## Widget Features

### 📭 Dead Stock Widget
- **Icon:** 📭 (mailbox - no mail)
- **Color:** Gray (#9CA3AF) 
- **Data:**
  - Uses same date range filter as other widgets
  - Shows top N items (respects user selection)
  - Displays products with:
    - Zero sales in the selected period
    - Positive stock on hand or incoming
  - Ranked by stock quantity (descending)

## Responsive Design
- Mobile: 1 column (stacked vertically)
- Tablet & Desktop: 2 columns (side by side)
- Category table spans full width below stock analysis

## API Response
The `/inventory/insights` endpoint now returns:
```json
{
  "fastMovers": [...],
  "deadStock": [...],      // NEW
  "lowStock": [...],
  "nearExpiry": [...],
  "reorderSuggestions": [...],
  "categorySummaries": [...],
  "brandSummaries": [...],
  "meta": {
    "counts": {
      "fastMovers": 20,
      "deadStock": 15,     // NEW
      "lowStock": 8,
      ...
    }
  }
}
```

## Testing the Changes
1. Open the **Insights** page
2. Set a date range or select a number of days
3. Observe the new **📭 Dead Stock** widget showing products with no sales in that period
4. Compare layouts:
   - Top section: Fast Movers vs Dead Stock (side by side)
   - Middle section: Sales Rate vs Stock Days Remaining (side by side)
   - Bottom section: Category metrics (full width)

## Benefits
✅ Identify slow-moving inventory for promotional campaigns  
✅ Detect obsolete or seasonal products no longer in demand  
✅ Better space utilization with clearer widget arrangement  
✅ Simultaneous view of both "good" (fast movers) and "bad" (dead stock) inventory  
✅ Date range aware - dynamically calculates based on selected period

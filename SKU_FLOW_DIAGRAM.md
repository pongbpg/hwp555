# SKU Generation Flow - Visual Guide

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Products.jsx Component                      │  │
│  │                                                          │  │
│  │  Form Inputs:                                           │  │
│  │  ├── Product Name: "Air Max 90"                         │  │
│  │  ├── Brand Select: Nike (ID: ...)                       │  │
│  │  ├── Category Select: Shoe (ID: ...)                    │  │
│  │  ├── Status: "✅ ใช้งาน"                                 │  │
│  │  ├── Stock Alerts: ☑️ Enabled                            │  │
│  │  │                                                       │  │
│  │  └── Variants:                                          │  │
│  │      ├── Model: "AirMax90" ← NEW                        │  │
│  │      ├── Color: "Black"                                 │  │
│  │      ├── Size: "40"                                     │  │
│  │      ├── Material: "Leather"                            │  │
│  │      └── SKU: "" (empty - auto-generate)                │  │
│  │                                                          │  │
│  │  [Save Button]                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────┬──────────────────────────────────────┘
                         │ HTTP POST /api/products
                         │ (variants with empty SKU)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Node.js)                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         products.js - POST Route Handler                │  │
│  │                                                          │  │
│  │  1. Receive request body:                               │  │
│  │     { name, brand, category, variants: [...] }          │  │
│  │                                                          │  │
│  │  2. For each variant with empty SKU:                    │  │
│  │     ├── Call generateSKUFromVariant()                   │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             │                                  │
│  ┌──────────────────────────▼───────────────────────────────┐  │
│  │    generateSKUFromVariant() Function                     │  │
│  │                                                          │  │
│  │  3. Load Brand document:                                │  │
│  │     GET db.brands[brand_id]                             │  │
│  │     → { name: "Nike" }                                  │  │
│  │                                                          │  │
│  │  4. Load Category document:                             │  │
│  │     GET db.categories[category_id]                      │  │
│  │     → { name: "Shoe" }                                  │  │
│  │                                                          │  │
│  │  5. Build SKU parts array:                              │  │
│  │     ["Nike", "Shoe", "AirMax90", "Black", "40", ...]   │  │
│  │                                                          │  │
│  │  6. Filter empty parts:                                 │  │
│  │     → ["Nike", "Shoe", "AirMax90", "Black", "40", ...] │  │
│  │                                                          │  │
│  │  7. Join with separator " - ":                          │  │
│  │     → "Nike - Shoe - AirMax90 - Black - 40 - Leather"  │  │
│  │                                                          │  │
│  │  8. Convert to uppercase:                               │  │
│  │     → "NIKE - SHOE - AIRMAX90 - BLACK - 40 - LEATHER"   │  │
│  │                                                          │  │
│  │  RETURN: "NIKE - SHOE - AIRMAX90 - BLACK - 40 - LEATHER"│  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             │                                  │
│  ┌──────────────────────────▼───────────────────────────────┐  │
│  │         Back to POST Route Handler                      │  │
│  │                                                          │  │
│  │  9. Assign generated SKU to variant:                    │  │
│  │     variant.sku = generated_sku                         │  │
│  │                                                          │  │
│  │  10. Save to MongoDB:                                   │  │
│  │      db.products.insertOne({                            │  │
│  │        name: "Air Max 90",                              │  │
│  │        brand: nike_id,                                  │  │
│  │        category: shoe_id,                               │  │
│  │        status: "active",                                │  │
│  │        enableStockAlerts: true,                          │  │
│  │        variants: [{                                      │  │
│  │          sku: "NIKE - SHOE - AIRMAX90 - BLACK - 40...", │  │
│  │          model: "AirMax90",                              │  │
│  │          color: "Black",                                 │  │
│  │          size: "40",                                     │  │
│  │          material: "Leather"                             │  │
│  │        }]                                                │  │
│  │      })                                                  │  │
│  └──────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────────┘
                             │ HTTP 201 Response + created product
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│                                                                 │
│  Response received:                                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  {                                                       │  │
│  │    _id: "...",                                           │  │
│  │    name: "Air Max 90",                                   │  │
│  │    status: "active",                                     │  │
│  │    enableStockAlerts: true,                              │  │
│  │    variants: [{                                          │  │
│  │      sku: "NIKE - SHOE - AIRMAX90 - BLACK - 40 - LEATHER"│  │
│  │      model: "AirMax90",                                  │  │
│  │      ...                                                 │  │
│  │    }]                                                    │  │
│  │  }                                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Display Success Message:                                      │
│  "✅ สินค้าสร้างเสร็จแล้ว"                                       │
│                                                                 │
│  Show Auto-Generated SKU:                                      │
│  "SKU: NIKE - SHOE - AIRMAX90 - BLACK - 40 - LEATHER"          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Sequence

```
Step 1: User Creates Product
┌──────────────────────────────────────────────┐
│ User enters form data:                       │
│ ├── Name: "Air Max 90"                       │
│ ├── Brand: "Nike" (selected)                 │
│ ├── Category: "Shoe" (selected)              │
│ ├── Variant:                                 │
│ │  ├── Model: "AirMax90"                     │
│ │  ├── Color: "Black"                        │
│ │  ├── Size: "40"                            │
│ │  ├── Material: "Leather"                   │
│ │  └── SKU: [EMPTY]                          │
│ └── Clicks "Save"                            │
└──────────────────────────────────────────────┘

Step 2: Frontend Validation & Submission
┌──────────────────────────────────────────────┐
│ React Component (handleCreate):              │
│ ├── Validates required fields               │
│ ├── Builds payload object                    │
│ ├── Includes variant with empty SKU          │
│ └── Sends POST request to API                │
└──────────────────────────────────────────────┘

Step 3: Backend Route Handler
┌──────────────────────────────────────────────┐
│ Express Route (POST /api/products):          │
│ ├── Receives request body                    │
│ ├── Validates input data                     │
│ ├── For each variant:                        │
│ │  └── if (variant.sku is empty) {          │
│ │      Call generateSKUFromVariant()         │
│ │    }                                        │
│ └── Continue with product creation           │
└──────────────────────────────────────────────┘

Step 4: SKU Generation
┌──────────────────────────────────────────────┐
│ generateSKUFromVariant():                    │
│ ├── QUERY db.brands (Nike)                  │
│ │   └── Result: { name: "Nike" }             │
│ ├── QUERY db.categories (Shoe)              │
│ │   └── Result: { name: "Shoe" }             │
│ ├── Build parts: [                           │
│ │   "Nike",                                  │
│ │   "Shoe",                                  │
│ │   "AirMax90",  ← from variant.model       │
│ │   "Black",     ← from variant.color       │
│ │   "40",        ← from variant.size        │
│ │   "Leather"    ← from variant.material    │
│ │ ]                                          │
│ ├── Join: "Nike - Shoe - AirMax90 - Black - 40 - Leather" │
│ └── Uppercase: "NIKE - SHOE - AIRMAX90 - BLACK - 40 - LEATHER" │
└──────────────────────────────────────────────┘

Step 5: Database Save
┌──────────────────────────────────────────────┐
│ Product Creation:                            │
│ ├── INSERT product document                  │
│ ├── With variant.sku:                        │
│ │   "NIKE - SHOE - AIRMAX90 - BLACK - 40..." │
│ ├── With status: "active"                    │
│ ├── With enableStockAlerts: true             │
│ └── With model: "AirMax90"                   │
│                                              │
│ RESULT: Product saved with auto-generated SKU │
└──────────────────────────────────────────────┘

Step 6: Response & Display
┌──────────────────────────────────────────────┐
│ Response sent to Frontend:                   │
│ ├── Status: 201 Created                      │
│ ├── Body includes generated SKU              │
│ └── Full product document                    │
│                                              │
│ Frontend displays:                           │
│ ├── Success message                          │
│ ├── Product created with SKU:                │
│ │   "NIKE - SHOE - AIRMAX90 - BLACK - 40..." │
│ └── Redirect to products list                │
└──────────────────────────────────────────────┘
```

## Key Features in Context

```
┌─────────────────────────────────────────────────────────────┐
│                    Product Lifecycle                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  FEATURE 1: Status (Active/Archived)                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Active Product:                                     │   │
│  │  ├── Visible in UI                                  │   │
│  │  ├── Available for orders                           │   │
│  │  ├── Generates alerts if enabled                    │   │
│  │  └── Shows full information                         │   │
│  │                                                     │   │
│  │ Archived Product:                                   │   │
│  │  ├── Hidden from order dropdown                     │   │
│  │  ├── Still in database (not deleted)                │   │
│  │  ├── Can be reactivated                             │   │
│  │  └── Shows "Archived" badge                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  FEATURE 2: Stock Alerts Toggle                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Enabled (Default):                                  │   │
│  │  ├── Low stock generates notification               │   │
│  │  ├── Appears in Alerts page                         │   │
│  │  ├── Includes in Insights calculations              │   │
│  │  └── LINE alerts sent                               │   │
│  │                                                     │   │
│  │ Disabled:                                           │   │
│  │  ├── No notifications sent                          │   │
│  │  ├── Hidden from Alerts page                        │   │
│  │  ├── Excluded from calculations                     │   │
│  │  └── Shows "🔇" (muted) indicator                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  FEATURE 3: SKU Formula (NEW)                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Auto-Generation:                                    │   │
│  │  ├── Brand + Category (from selectors)              │   │
│  │  ├── Model + Color + Size + Material (from form)    │   │
│  │  ├── Combined with " - " separator                  │   │
│  │  ├── Converted to uppercase                         │   │
│  │  └── Saved to database                              │   │
│  │                                                     │   │
│  │ User Benefits:                                      │   │
│  │  ├── No need to create SKU manually                 │   │
│  │  ├── Consistent format across products              │   │
│  │  ├── Easy to understand what product is             │   │
│  │  ├── Better searchability                           │   │
│  │  └── Works with external systems                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Example: Complete Product Journey

```
TIME: 14:30 - Product Manager Creates Nike Shoe

  INPUT:
  ├── Name: "Nike Air Max 90"
  ├── Brand: Nike ← Select from dropdown
  ├── Category: Shoe ← Select from dropdown
  ├── Status: Active ← Dropdown
  ├── Stock Alerts: Enabled ← Checkbox
  │
  └── Variants:
      ├── Model: AirMax90 ← Type in new field
      ├── Color: Black ← Type
      ├── Size: 40 ← Type
      ├── Material: Leather ← Type
      ├── Price: 3000 THB
      ├── Cost: 1500 THB
      └── SKU: [Leave Empty] ← Will auto-generate

  PROCESSING:
  1. Frontend sends POST request
  2. Backend loads Brand "Nike" from DB
  3. Backend loads Category "Shoe" from DB
  4. Combines: Nike - Shoe - AirMax90 - Black - 40 - Leather
  5. Uppercase: NIKE - SHOE - AIRMAX90 - BLACK - 40 - LEATHER
  6. Saves to database

  OUTPUT:
  ├── ✅ Product created successfully
  ├── SKU: NIKE - SHOE - AIRMAX90 - BLACK - 40 - LEATHER
  ├── Status: ✅ Active
  ├── Alerts: 🔔 Enabled
  └── Available in Orders form immediately

TIME: 14:35 - Sales Manager Places Order
  ├── Goes to Orders page
  ├── Clicks "Select Product"
  ├── Sees: "Nike Air Max 90"
  │         (Archived products NOT in list)
  ├── Selects variant
  ├── SKU displays: NIKE - SHOE - AIRMAX90 - BLACK - 40 - LEATHER
  └── Creates order

TIME: 14:40 - Stock Alert Triggers
  ├── System detects stock below threshold
  ├── Checks if enableStockAlerts = true ✅
  ├── Yes → Sends LINE notification
  │   "Nike Air Max 90 (Black, 40): Stock low"
  └── Updates Alerts dashboard

TIME: 15:00 - Product Manager Disables Alerts
  ├── Edits "Nike Air Max 90"
  ├── Uncheck "🔔 Stock Alerts"
  ├── Save
  └── Future alerts disabled for this product
      (can be re-enabled anytime)

TIME: 15:30 - Product Manager Archives Product
  ├── Edits "Nike Air Max 90"
  ├── Change Status to "📦 Archived"
  ├── Save
  └── Product:
      ├── Hidden from Orders dropdown ✅
      ├── Shows "Archived" badge ✅
      ├── Still in database ✅
      └── Can be unarchived later ✅
```

## Integration Points

```
┌─────────────────────────────────────────────────────┐
│         How SKU Formula Integrates                 │
├─────────────────────────────────────────────────────┤
│                                                    │
│  Products.jsx (UI)                                │
│  ├─→ Sends variant with model field               │
│  ├─→ Displays auto-generated SKU                  │
│  └─→ Leaves SKU field empty (backend generates)   │
│                                                    │
│  products.js (Backend Route)                      │
│  ├─→ Receives variant request                     │
│  ├─→ Checks if SKU is empty                       │
│  ├─→ Calls generateSKUFromVariant()               │
│  └─→ Saves generated SKU                          │
│                                                    │
│  Brand/Category Models (Database)                 │
│  ├─→ Provides brand names for SKU                 │
│  ├─→ Provides category names for SKU              │
│  └─→ Used during SKU generation                   │
│                                                    │
│  Orders.jsx (Filter)                              │
│  ├─→ Shows only active products (status check)    │
│  ├─→ Displays full SKU to user                    │
│  └─→ Uses SKU for order reference                 │
│                                                    │
│  Alerts/Inventory (Filtering)                     │
│  ├─→ Checks enableStockAlerts flag                │
│  ├─→ Only shows alerts for enabled products       │
│  └─→ Uses SKU in alert messages                   │
│                                                    │
└─────────────────────────────────────────────────────┘
```

---

**This visual guide shows the complete flow of the SKU generation system from user input to database storage and eventual use throughout the application.**


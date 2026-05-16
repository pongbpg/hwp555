# Copilot Instructions for HWP555 Codebase

## Project Overview

**HWP555** is a monorepo containing three integrated management systems:
- **HR System**: Employee management, attendance, KPI scoring, salary tracking (ports 5000/3000)
- **Stock System**: Inventory management, product tracking, stock alerts (ports 5001/3001)
- **Sale System**: Facebook Messenger integration, order management, shipping (ports 3002/5002)

All systems share the same MongoDB employee collection and JWT authentication. Sale system uses stock_system API for inventory checks.

**Key Files**: Start with [START_HERE.md](../START_HERE.md), [SKU_NAMING_FORMULA.md](../SKU_NAMING_FORMULA.md), and [STOCK_ALERT_FIX.md](../STOCK_ALERT_FIX.md) for critical patterns.

## Architecture & Data Flow

### Monorepo Structure
```
root package.json      # Orchestrates all npm scripts via concurrently
├── hr_system/
│   ├── backend/       # Express.js + Mongoose (5000)
│   └── frontend/      # React + Vite (3000)
├── stock_system/
│   ├── backend/       # Express.js + Mongoose (5001)
│   └── frontend/      # React + Vite (3001)
└── sale_system/
    ├── backend/       # Express.js + Mongoose, Facebook Webhook (5002)
    └── frontend/      # React + Vite (3002)
```

**Key Script Pattern**: Use workspace-level scripts for development:
- `npm run dev` - all systems (6 services)
- `npm run dev:backend` / `npm run dev:frontend` - selective startup
- `npm run {hr|stock|sale}:{backend|frontend}` - isolated systems
- `npm run install:all` - install deps for all systems

### Authentication Flow
- All backends share same `JWT_SECRET` and `MONGODB_URI`
- HR backend creates users (Employee model, shared collection across all systems)
- Stock & Sale frontends/backends use same Employee collection for auth
- Token stored in localStorage, passed as `Authorization: Bearer <token>`
- Middleware: `authenticateToken` validates JWT, loads Employee; `authorizeRoles(...roles)` gates endpoints
- **Token Reuse**: Same JWT token works across all systems (HR, Stock, Sale)

### Stock System Complexity
The stock system has sophisticated inventory modeling with multiple layers:

**Product → Variants → Batches hierarchy:**
```
Product (name, category, brand, leadTimeDays, reorderBufferDays, costingMethod, minOrderQty)
  └── Variants[] (SKU-based, each variant tracks own stock independently)
      └── Batches[] (FIFO/LIFO/WAC tracking, with expiryDate, supplier, cost)
```

**Stock State Fields per Variant:**
- `stockOnHand`: Physical inventory on-hand
- `committed`: Reserved/allocated but not yet consumed (for pending sales)
- `incoming`: Purchase orders not yet received
- `available` (virtual): `stockOnHand - committed` (used in inventory calculations)
- `reorderPoint` (optional, overrides computed value): User-defined threshold
- `allowBackorder`: Boolean flag allowing negative stock temporarily
- `batches[]`: Array of batch records tracking cost/supplier/expiry for costing methods

**Costing Methods** (Product.costingMethod):
- `FIFO` (default): First In, First Out - oldest batches consumed first
- `LIFO`: Last In, First Out - newest batches consumed first
- `WAC`: Enum value exists but no separate WAC logic — treated as FIFO in costingService
- Used in: `calculateInventoryValue()`, `getBatchConsumptionOrder()`, `consumeBatchesByOrder()` — **all in `/services/costingService.js`**

**SKU Generation** (automatic in POST /products/:id/variants):
- Formula: `{Brand} - {Category} - {Model} - {Color} - {Size} - {Material}`
- Example: `APPLE - ELECTRONICS - IPHONE15 - BLACK - 256GB - GLASS`
- Parts assembled from `product.brand` (String), `product.category` (String), `variant.model`, and `variant.attributes` Map
- **Note**: `category` and `brand` are plain strings in Product schema (not ObjectId refs)
- **Auto-generation**: If SKU field left empty in POST/PATCH, backend auto-generates using formula
- See [SKU_NAMING_FORMULA.md](../SKU_NAMING_FORMULA.md) for full formula rules and examples

**Reorder Calculation Standardization** (⚠️ Critical):
- **Calculation window**: Uses `leadTimeDays + bufferDays` for sales aggregation (allows per-product customization)
  - Old practice (❌): 30-day fixed window  
  - New practice (✅): `product.leadTimeDays + product.reorderBufferDays` (varies by product)
- **Formula**: `safetyStock = ceil(dailySalesRate × bufferDays)` then `reorderPoint = ceil(dailySalesRate × leadTimeDays + safetyStock)`
- **bufferDays source**: `product.reorderBufferDays ?? 7` (always fallback to 7, never hardcode)
- **leadTimeDays source**: `product.leadTimeDays || 7`
- Used in: LINE alerts, Alerts API, Insights API, Dashboard calculations
- See [STOCK_ALERT_FIX.md](../STOCK_ALERT_FIX.md) for detailed standardization

## Developer Workflows

### Initial Setup
```bash
npm run install:all          # Install all dependencies
npm run dev                  # Start all systems with concurrently
```

### Backend Development
- **HR Backend**: `cd hr_system/backend && npm run dev`
- **Stock Backend**: `cd stock_system/backend && npm run dev`
- **Sale Backend**: `cd sale_system/backend && npm run dev`
- All use nodemon for auto-reload on file changes
- Environment: copy `.env.example` to `.env`, set `MONGODB_URI` and `JWT_SECRET`

### Frontend Development
- **HR Frontend**: `cd hr_system/frontend && npm run dev` (Vite, port 3000)
- **Stock Frontend**: `cd stock_system/frontend && npm run dev` (Vite, port 3001)
- **Sale Frontend**: `cd sale_system/frontend && npm run dev` (Vite, port 3002)
- Environment: set `VITE_API_BASE_URL` (default http://localhost:5001/api for stock, http://localhost:5000 for HR, http://localhost:5002 for sale)
- Note: Frontend uses axios client initialized with baseURL; token set via `setAuthToken()` interceptor
- **Critical**: Each frontend .env must reference correct backend API URL (mismatches cause 401/404 errors)

### Building
- `npm run build` - builds all three frontends
- `npm run build:hr` / `npm run build:stock` / `npm run build:sale` - selective builds
- Stock frontend uses Tailwind CSS + PostCSS for styling

### Environment Setup
**Required env variables** (set in root `.env`):
- `MONGODB_URI`: MongoDB connection string (shared across all systems)
- `JWT_SECRET`: Secret key for signing JWTs (must be identical across all backends)
- `LINE_CHANNEL_ACCESS_TOKEN` (optional): For LINE Messaging API integration (stock system alerts)
- `LINE_NOTIFY_TOKEN` (optional): For LINE Notify API fallback
- `DEBUG_STOCK_ALERTS` (optional): Set to '1' or 'true' for detailed stock alert logs

## Sale System Architecture

**Purpose**: Manage sales orders with Facebook Messenger integration and real-time stock synchronization.

**Key Features**:
- Facebook Webhook integration for customer messages
- Order management (pending → confirmed → packed → shipped → delivered)
- Real-time stock checking and deduction via stock_system HTTP API
- Customer & payment tracking
- Shipping slip & invoice generation

**Stock Integration Pattern**:
- Sale backend calls `http://localhost:5001/api/...` endpoints to check/deduct stock
- Uses same JWT token (obtained from HR backend) for stock system auth
- Before creating sale order: verify stock in stock_system
- After creating sale order: call POST /orders (type: 'sale') in stock_system to deduct inventory
- Critical: Handle stock API timeouts gracefully - queue orders if stock service unavailable

**Models** (MongoDB):
- `Customer`: name, phone, address, email, purchaseHistory
- `Order`: customerId, items[], totalAmount, paymentMethod, status, shippingAddress
- `Message`: customerId, facebookUserId, messageText, timestamp (webhook data)

**Routes**:
- `POST /facebook/webhook` - Facebook webhook receiver (verify token, handle messages)
- `POST /orders` - Create sales order (integrates with stock_system)
- `GET /orders/:id` - Fetch order details (populates customer data)
- `PATCH /orders/:id/status` - Update order status (packed/shipped/delivered)

## Code Patterns & Conventions

### Mongoose Schemas (Backend Models)

**Product Schema Structure:**
- Top-level fields: name, category (String), brand (String), unit, status ('active'|'archived'), enableStockAlerts (boolean), leadTimeDays, reorderBufferDays, minOrderQty, costingMethod ('FIFO'|'LIFO'|'WAC'), skuProduct, attributesSchema[]
- `attributesSchema[]`: Dynamic attribute definitions for product-specific variant fields `{ key, label, inputType, options[] }`
- `variants[]` (subdocument array): Each product can have multiple SKUs with independent stock
- `variantSchema` includes: sku, name, barcode, model, price, cost, committed, incoming, reorderPoint, reorderQty, batches[], status ('active'|'inactive'), allowBackorder, enableStockAlerts
  - `attributes`: Map of String (flexible key-value for product-specific attributes like color, size)
  - `enableStockAlerts`: `undefined` = inherit from product, `true`/`false` = SKU-level override
  - `allowBackorder`: When true, allows negative stock via BACKORDER batches
- `batchSchema`: batchRef, supplier, cost, quantity, expiryDate, receivedAt, orderId (reference to InventoryOrder)
  - Batch history fields: `quantityConsumed`, `lastConsumedAt`, `consumptionOrder[]` (each entry: orderId, orderReference, quantityConsumedThisTime, consumedAt)
  - BACKORDER batches: `batchRef` starts with `'BACKORDER-'`, quantity is negative (represents pre-sold stock)
- **Virtual fields** (computed from batches, always up-to-date):
  - `stockOnHand`: Sum of all batch quantities (read-only, computed from `batches` array — including BACKORDER negatives)
  - `available`: `stockOnHand - committed` (available for new sales)
  - `totalBatchQuantity`, `totalConsumed`: Diagnostic fields
  - `isLowStock`, `stockStatus`: Computed alert indicators
- **Important**: Virtuals require `.set('toJSON', { virtuals: true })` to serialize in responses; `stockOnHand` is **never directly written** - update through batch mutations

**Product Status & Alerts:**
- `status: 'active' | 'archived'` - Archive products without data loss (archived products hidden from order entry)
- `enableStockAlerts: boolean` (product level) - Toggle alerts per product
- `variant.enableStockAlerts: boolean | undefined` - Per-SKU override: `undefined` inherits from product, `true`/`false` overrides

**InventoryOrder Schema:**
- `type`: 'sale' | 'purchase' | 'adjustment'
- `status`: 'pending' | 'completed' | 'cancelled'
- `items[]`: Array of order items with productId, variantId, sku, quantity, receivedQuantity (for purchase orders)
- Purchase orders use two-phase:
  1. POST creates order with `status: 'pending'`, updates `variant.incoming`
  2. PATCH /receive increments `variant.stockOnHand` and adds batches, updates `status: 'completed'` when fully received

**Cancelled Order Tracking** (critical for batch filtering):
- When order cancelled, batches linked via `orderId` must be removed/hidden from alerts
- Helper function `getCancelledBatchRefs()` queries cancelled orders, builds Set of orderId and batchRef
- Helper function `isBatchFromCancelledOrder(batch, cancelledOrderIds, cancelledBatchRefs)` checks both fields
- **Used in**: nearExpiry alerts, Insights API to exclude stale batches from expiry warnings

### API Endpoint Patterns

**Stock Inventory Order Flow** (inventory.js):
```
POST /orders
  ├─ For 'purchase': Create order, set incoming, no batch creation yet
  ├─ For 'sale'|'adjustment': Apply stock change immediately via applyStockChange()
  └─ For 'sale': Call checkAndAlertAfterSale() async to trigger LINE notifications

PATCH /orders/:id/receive (purchase orders only)
  ├─ Update receivedQuantity, move from incoming to stockOnHand
  ├─ Create batches with auto-generated batchRef if not provided (format: LOT{YYMMDD}-{HHMM}-{XXXX})
  └─ Record StockMovement for each received batch

PATCH /orders/:id/cancel
  ├─ Phase 1: Validate can rollback (check if stock sufficient)
  ├─ Phase 2: Reverse stock changes (subtract from incoming/stockOnHand)
  ├─ Filter out batches linked via orderId (prevents them showing in nearExpiry alerts)
  └─ Set order.status = 'cancelled'
```

**Batch Consumption Logic** (core to stock accuracy, in `/services/costingService.js`):
- `getBatchConsumptionOrder(batches, costingMethod)`: Returns consumable batches sorted by `receivedAt`; **automatically excludes BACKORDER batches** (negative qty, batchRef starts with 'BACKORDER-')
  - FIFO: ascending (oldest first)
  - LIFO: descending (newest first)
- `consumeBatchesByOrder(variant, sortedBatches, quantity, costingMethod, metadata)`: Consumes batches in order, records history (`consumptionOrder[]`, `quantityConsumed`, `lastConsumedAt`); sets qty to 0 (does NOT delete) for history preservation; **preserves BACKORDER batches** in variant.batches after consumption
- **Returns**: unconsumed quantity (0 for normal sales, >0 if insufficient stock)
- **BACKORDER batches**: When `variant.allowBackorder = true` and stock is insufficient, creates a batch with `batchRef: 'BACKORDER-{timestamp}'` and negative quantity; absorbed/cancelled when new purchase received
- Called in: POST /orders (sale/adjustment types), via `applyStockChange()` in inventory.js

**Reorder Alerts Flow** (stockAlertService.js):
1. After sale, `checkAndAlertAfterSale()` called with soldItems array
2. **Calculation window**: Uses `leadTimeDays + bufferDays` sales period (✅ NOT 30 days)
3. For each item, `calculateAverageDailySalesFromOrders(variantId, salesPeriodDays)` queries InventoryOrder aggregation
4. `checkVariantStockRisk()` determines if alert needed using `calculateReorderMetrics()`, checks `variant.enableStockAlerts` (falls back to `product.enableStockAlerts`)
5. **Alert `availableStock`** = `currentStock + purchaseRemaining` — purchaseRemaining calculated from pending purchase order receipts (NOT `variant.incoming`)
6. If alert triggered, sends via `sendStockAlertFlexMessage()` (LINE Messaging API) or `sendStockAlertText()` (LINE Notify)
7. Optional MOQ optimization: `optimizeOrderWithMOQ()` distributes deficit proportionally if product.minOrderQty > total suggested order

### Stock Valuation & Costing

**`calculateInventoryValue(variant, costingMethod)`** (in `/services/costingService.js`) returns total stock value:
- **FIFO**: Walks batches newest→oldest (assumes oldest sold first); remaining stock has newest cost
- **LIFO**: Walks batches oldest→oldest (assumes newest sold first); remaining stock has oldest cost
- Returns 0 and warns if stock exists but no batches tracked (no fallback to `variant.cost`)
- Used in: Dashboard summary, Stock value reporting

**`getBatchConsumptionOrder(batches, costingMethod)`** + **`consumeBatchesByOrder(variant, sortedBatches, quantity, costingMethod, metadata)`**: Extracted helpers for consuming batches with history tracking. Both live in `/services/costingService.js`.

### Stock Movement & Audit Trail

**StockMovement Model** (movements.js routes):
- Records every inventory change: type ('in', 'out', 'adjust'), quantity (signed), sku, userId, createdBy/createdByName
- `recordMovement(data)` helper logs movement from inventory order operations
- Used for audit trails, dashboards, and movement history queries
- **Pattern**: After saving product stock changes, call `recordMovement()` to create audit entry

**Data Consistency Patterns:**
- **Atomic operations**: Use product.save() to persist variant changes (including batch mutations)
- **Two-phase commits** (purchase orders): Defer batch creation until receipt confirmed to avoid orphaned batches
- **Rollback on error**: If validation fails during applyStockChange(), restore previous state before throwing
- **Cascade updates**: When variant.stockOnHand changes, variants array is saved atomically (no nested updates)

### Frontend Component Patterns (React + Vite)

**Pages & Access Control:**
- `Login`: Sets token and user in localStorage, calls setAuthToken() to configure axios defaults
- `Dashboard`, `Alerts`, `Insights`, `ReplenishmentOrder`: Wrapped in `<AnalyticsRoute>` - requires role 'owner' or 'stock'
- `Products`, `Orders`, `Movements`, `CategoriesBrands`: Accessible to all authenticated users
- Navigate to appropriate default route based on user.role (analytics users → /dashboard, others → /products)

**API Integration Pattern:**
- Import api client: `import api from '../api.js'`
- Token auto-added via `setAuthToken()` interceptor in axios defaults
- Error handling: Check `error.response?.status`, display user-friendly messages
- Date handling: Use Date objects for dateFrom/dateTo in Insights filters, convert to ISO string in API calls

**Form State Management:**
- Controlled components with `useState` for form fields
- Separate state for loading, error, success messages during submission
- Reset form after successful submission
- Example pattern (Orders page): `const [orderForm, setOrderForm] = useState({ type: 'sale', items: [] })`

**Analytics Data Rendering:**
- Insights page accepts flexible date ranges (dateFrom/dateTo or days parameter)
- Dashboard and Alerts both query 30-day periods (hardcoded in backend, frontend shows 30-day by default)
- Handle empty states gracefully (no sales data, no alerts) before rendering charts

## Cross-System Communication

- **No direct API calls**: Frontend systems communicate only with their own backend
- **Shared Database**: All backends read/write same Employee collection for auth
- **Sale→Stock Integration**: Sale backend calls stock_system API to check/deduct inventory via HTTP requests
- **Token Portability**: Same JWT issued by any backend works for all systems (allows seamless switching)
- **Environment Separation**: Backends listen on different ports (5000/5001/5002) and configure baseURL distinctly in frontend .env

## Common Debugging Points

1. **Auth not working**: Check JWT_SECRET consistency between backends; verify token in localStorage after login redirect
2. **Reorder alerts wrong**: Review STOCK_ALERT_FIX.md; ensure all calculations use 30-day window + `product.reorderBufferDays ?? 7`; enable DEBUG_STOCK_ALERTS=true env var for detailed logs
3. **Port conflicts**: Ensure hr_system/backend (5000), stock_system/backend (5001), sale_system/backend (5002) and frontends (3000/3001/3002) are available
4. **Variant not found**: Verify `selectVariant()` receives correct variantId/SKU; check if product.variants is populated
5. **Batch consumption off**: Trace `consumeBatches()` sorting logic (costingMethod determines FIFO/LIFO/WAC order) and quantity math in inventory.js
6. **Cancelled batches showing in alerts**: Ensure `getCancelledBatchRefs()` and `isBatchFromCancelledOrder()` are used in nearExpiry filtering (Insights/Alerts APIs)
7. **Stock movement missing**: Verify `recordMovement()` is called after every applyStockChange() or batch operation
8. **Purchase order not receiving**: Check two-phase flow - orderDate set? receivedQuantity < quantity? Batches created when receivedQuantity > 0?
9. **Insights date range wrong**: Dashboard hardcodes 30 days; custom ranges must use dateFrom/dateTo params; salesPeriodDays calculated from both or defaults to 30
10. **Sale system stock deduction failing**: Verify stock_system backend is running; check sale backend can reach http://localhost:5001; ensure same JWT_SECRET used; verify order items include productId, variantId, quantity

## Essential Patterns & Workflow

**When modifying inventory logic (applyStockChange, consumeBatches):**
1. Import costing functions from `../services/costingService.js` (not inline in inventory.js)
2. `getBatchConsumptionOrder()` already excludes BACKORDER batches — don't filter manually
3. Validate sufficient stock BEFORE mutation (unless `variant.allowBackorder = true`)
4. When `allowBackorder = true` and stock insufficient → create BACKORDER batch with negative qty (format: `BACKORDER-{Date.now()}`)
5. When new purchase received → absorb/cancel BACKORDER batches (add incoming to reduce negative)
6. Call recordMovement() for audit trail
7. `stockOnHand` is virtual (sum of batches) — never write it directly

**When adding new alerts or metrics:**
1. Always query InventoryOrder with type: 'sale', status: { $ne: 'cancelled' }
2. Use `leadTimeDays + bufferDays` window (not hardcoded 30 days)
3. Get leadTimeDays and bufferDays from Product level, not hardcoded
4. Filter out cancelled batches using getCancelledBatchRefs() + isBatchFromCancelledOrder()
5. Call calculateReorderMetrics() for consistent formulas across endpoints
6. Check `variant.enableStockAlerts` first, fall back to `product.enableStockAlerts`
7. Compute `availableStock = currentStock + purchaseRemaining` (not just `stockOnHand - committed`)

**When adding reorder-related features:**
1. Use `calculateReorderMetrics(dailySalesRate, leadTimeDays, bufferDays)` from stockAlertService
2. Daily sales rate must come from 30-day InventoryOrder aggregation (calculateAverageDailySalesFromOrders)
3. Buffer days: `product.reorderBufferDays ?? 7` (never fallback to other values)
4. Lead time: `product.leadTimeDays || 7`
5. Apply MOQ optimization via `optimizeOrderWithMOQ()` if product.minOrderQty > 0

## Key Files to Reference

- **Workflow orchestration**: [root package.json](../package.json)
- **Shared models**: [Employee.js](../stock_system/backend/models/Employee.js)
- **Product schema**: [stock_system/backend/models/Product.js](../stock_system/backend/models/Product.js)
- **Inventory logic**: [stock_system/backend/routes/inventory.js](../stock_system/backend/routes/inventory.js)
- **Costing service**: [stock_system/backend/services/costingService.js](../stock_system/backend/services/costingService.js) — `calculateInventoryValue`, `getBatchConsumptionOrder`, `consumeBatchesByOrder`
- **Reorder service**: [stock_system/backend/services/stockAlertService.js](../stock_system/backend/services/stockAlertService.js)
- **Replenishment page**: [stock_system/frontend/src/pages/ReplenishmentOrder.jsx](../stock_system/frontend/src/pages/ReplenishmentOrder.jsx)
- **Frontend routing**: [stock_system/frontend/src/App.jsx](../stock_system/frontend/src/App.jsx)
- **Frontend API client**: [stock_system/frontend/src/api.js](../stock_system/frontend/src/api.js)
- **Standardization notes**: [STOCK_ALERT_FIX.md](../STOCK_ALERT_FIX.md)

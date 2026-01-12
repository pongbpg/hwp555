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
- `WAC`: Weighted Average Cost - treats batches as homogeneous pool
- Used in: `calculateInventoryValue()`, `getBatchConsumptionOrder()`, `consumeBatchesByOrder()`

**SKU Generation** (automatic in POST /products/:id/variants):
- Formula: `{Brand} - {Category} - {Model} - {Color} - {Size} - {Material}`
- Example: `APPLE - ELECTRONICS - IPHONE15 - BLACK - 256GB - GLASS`
- Parts assembled from `product.brand`, `product.category`, `variant.attributes` map
- See [SKU_NAMING_FORMULA.md](../SKU_NAMING_FORMULA.md) for full formula rules

**Reorder Calculation Standardization** (⚠️ Critical):
- **ALL endpoints use 30-day sales window** (never query parameter-dependent)
- Formula: `safetyStock = ceil(dailySalesRate × bufferDays)` then `reorderPoint = ceil(dailySalesRate × leadTimeDays + safetyStock)`
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

### Building
- `npm run build` - builds both frontends
- `npm run build:hr` / `npm run build:stock` - selective builds
- Stock frontend uses Tailwind CSS + PostCSS for styling

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
- Top-level fields: name, category, brand, unit, status, tags
- `variants[]` (subdocument array): Each product can have multiple SKUs with independent stock
- `variantSchema` includes: sku, price, cost, stockOnHand, committed, incoming, reorderPoint, batches[], status
- `batchSchema`: batchRef, supplier, cost, quantity, expiryDate, receivedAt, **orderId** (reference to InventoryOrder for cancelled order tracking)
- Virtual fields: `available`, `totalBatchQuantity`, `isLowStock`, `stockStatus`
- **Important**: Virtuals set with `.set('toJSON', { virtuals: true })` to include in JSON responses

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

**Batch Consumption Logic** (core to stock accuracy):
- Function `consumeBatches(variant, product, quantity)`: Uses `getBatchConsumptionOrder()` to sort batches, then `consumeBatchesByOrder()` to consume
- `getBatchConsumptionOrder()`: Returns batches sorted by `receivedAt` based on `costingMethod`
  - FIFO: ascending (oldest first)
  - LIFO: descending (newest first)
  - WAC: unsorted (treat as pool)
- `consumeBatchesByOrder()`: Iterates sorted batches, subtracts from each until quantity satisfied, removes zero-qty batches
- **Returns**: unconsumed quantity (should be 0 for normal sales, >0 if insufficient stock or backorder allowed)
- Called in: POST /orders (sale/adjustment types), used by applyStockChange() before updating stockOnHand

**Reorder Alerts Flow** (stockAlertService.js):
1. After sale, `checkAndAlertAfterSale()` called with soldItems array
2. For each item, `calculateAverageDailySalesFromOrders(variantId, 30)` queries InventoryOrder aggregation (30-day window fixed)
3. `checkVariantStockRisk()` determines if alert needed using `calculateReorderMetrics()`
4. If alert triggered, sends via `sendStockAlertFlexMessage()` (LINE Messaging API) or `sendStockAlertText()` (LINE Notify)
5. Optional MOQ optimization: `optimizeOrderWithMOQ()` distributes deficit proportionally if product.minOrderQty > total suggested order

### Stock Valuation & Costing

**calculateInventoryValue(variant, costingMethod)** returns total stock value:
- **FIFO**: Latest batch cost × stock quantity (assumes latest batches remain)
- **LIFO**: Oldest batch cost × stock quantity (assumes oldest batches remain)
- **WAC**: Weighted average of all batch costs based on quantities
- Used in: Dashboard summary, Stock value reporting
- Falls back to `stockOnHand × variant.cost` if no batches tracked

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
1. Consider both batch-tracked and non-tracked stock flows
2. Validate sufficient stock BEFORE mutation (unless allowBackorder set)
3. Return unconsumed quantity for backorder scenarios
4. Call recordMovement() for audit trail
5. Handle virtual `available` field in calculations (stockOnHand - committed)

**When adding new alerts or metrics:**
1. Always query InventoryOrder with type: 'sale', status: { $ne: 'cancelled' }
2. Use 30-day window minimum (even if parameterized)
3. Get leadTimeDays and bufferDays from Product level, not hardcoded
4. Filter out cancelled batches using getCancelledBatchRefs() + isBatchFromCancelledOrder()
5. Call calculateReorderMetrics() for consistent formulas across endpoints

**When adding reorder-related features:**
1. Use `calculateReorderMetrics(dailySalesRate, leadTimeDays, bufferDays)` from stockAlertService
2. Daily sales rate must come from 30-day InventoryOrder aggregation (calculateAverageDailySalesFromOrders)
3. Buffer days: `product.reorderBufferDays ?? 7` (never fallback to other values)
4. Lead time: `product.leadTimeDays || 7`
5. Apply MOQ optimization via `optimizeOrderWithMOQ()` if product.minOrderQty > 0

## Key Files to Reference

- **Workflow orchestration**: [root package.json](../package.json)
- **Shared models**: [Employee.js](../stock_system/backend/models/Employee.js)
- **Inventory logic**: [stock_system/backend/routes/inventory.js](../stock_system/backend/routes/inventory.js)
- **Reorder service**: [stock_system/backend/services/stockAlertService.js](../stock_system/backend/services/stockAlertService.js)
- **Frontend routing**: [stock_system/frontend/src/App.jsx](../stock_system/frontend/src/App.jsx)
- **Frontend API client**: [stock_system/frontend/src/api.js](../stock_system/frontend/src/api.js)
- **Standardization notes**: [STOCK_ALERT_FIX.md](../STOCK_ALERT_FIX.md)

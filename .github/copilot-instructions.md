# Copilot Instructions for HWP555 Codebase

## Project Overview

**HWP555** is a monorepo containing two separate but integrated management systems:
- **HR System**: Employee management, attendance, KPI scoring, salary tracking (ports 5000/3000)
- **Stock System**: Inventory management, product tracking, stock alerts (ports 5001/3001)

Both systems share the same MongoDB employee collection and JWT authentication, allowing cross-system token reuse.

## Architecture & Data Flow

### Monorepo Structure
```
root package.json      # Orchestrates all npm scripts via concurrently
├── hr_system/
│   ├── backend/       # Express.js + Mongoose (5000)
│   └── frontend/      # React + Vite (3000)
└── stock_system/
    ├── backend/       # Express.js + Mongoose (5001)
    └── frontend/      # React + Vite (3001)
```

**Key Script Pattern**: Use workspace-level scripts for development:
- `npm run dev` - all systems
- `npm run dev:backend` / `npm run dev:frontend` - selective startup
- `npm run hr:backend` / `npm run stock:backend` - isolated systems

### Authentication Flow
- Both backends share same `JWT_SECRET` and `MONGODB_URI`
- HR backend creates users (Employee model, shared collection)
- Stock frontend/backend uses same Employee collection for auth
- Token stored in localStorage, passed as `Authorization: Bearer <token>`
- Middleware: `authenticateToken` validates JWT, loads Employee; `authorizeRoles(...roles)` gates endpoints

### Stock System Complexity
The stock system has sophisticated inventory modeling:
- **Variants**: Each Product has multiple variants (SKU-based), each with own pricing/stock/batches
- **Batches**: Variants track batch history (batchRef, supplier, cost, quantity, expiryDate, receivedAt)
- **Stock State**: Each variant tracks `stockOnHand`, `committed` (reserved), `incoming` (pending), computed `available = stockOnHand - committed`
- **Reorder Logic**: Uses `reorderPoint`, `reorderQty`, `leadTimeDays` calculated from sales metrics

**Critical**: Read [STOCK_ALERT_FIX.md](../STOCK_ALERT_FIX.md) for reorder calculation standardization (30-day sales window, bufferDays fallback to 7, consistent across LINE alerts/Insights API).

## Developer Workflows

### Initial Setup
```bash
npm run install:all          # Install all dependencies
npm run dev                  # Start all systems with concurrently
```

### Backend Development
- **HR Backend**: `cd hr_system/backend && npm run dev`
- **Stock Backend**: `cd stock_system/backend && npm run dev`
- Both use nodemon for auto-reload on file changes
- Environment: copy `.env.example` to `.env`, set `MONGODB_URI` and `JWT_SECRET`

### Frontend Development
- **HR Frontend**: `cd hr_system/frontend && npm run dev` (Vite, port 3000)
- **Stock Frontend**: `cd stock_system/frontend && npm run dev` (Vite, port 5173)
- Environment: set `VITE_API_BASE_URL` (default http://localhost:5001/api for stock, 5000 for HR)
- Note: Frontend uses axios client initialized with baseURL; token set via `setAuthToken()` interceptor

### Building
- `npm run build` - builds both frontends
- `npm run build:hr` / `npm run build:stock` - selective builds
- Stock frontend uses Tailwind CSS + PostCSS for styling

## Code Patterns & Conventions

### Mongoose Schemas (Backend Models)
- Subdocument arrays for related data: `variants` array in Product, `batches` array in variant
- Virtual fields: `available` computed on variant, used in inventory calculations
- Shared Employee model between HR and Stock systems
- Models imported with ES6: `import Model from '../models/Model.js'`

### API Endpoint Structure
- **Stock Inventory**: POST/PUT routes consume/receive inventory via InventoryOrder model, trigger StockMovement records
- **Batch Consumption**: `consumeBatches()` function sorts by expiryDate (FIFO), removes fully-used batches
- **Reorder Calculations**: `calculateReorderMetrics(dailySalesRate, leadTimeDays, bufferDays)` returns `{ reorderPoint, reorderQty }`
- **Role-Based Access**: Stock routes use `authorizeRoles('owner', 'stock')` for analytics

### Frontend Component Patterns (React + Vite)
- **Pages**: Login, Dashboard (analytics, owner/stock only), Products, Orders (purchase/sale/adjustment), Alerts, Insights
- **State Management**: localStorage for token/user, component useState for forms
- **Protected Routes**: `Protected` wrapper checks token; `AnalyticsRoute` checks user role before rendering
- **Form Handling**: Use controlled components with handleChange/handleSubmit patterns
- **API Calls**: Import api client, set headers via setAuthToken() on login

### Stock-Specific Patterns
- **Variant Selection**: `selectVariant(product, variantId, sku)` prioritizes variantId, falls back to SKU, then first variant
- **Insights Calculations**: 30-day sales window (`quantitySold / 30`), uses `product.reorderBufferDays ?? 7` for buffer
- **Alert Integration**: stockAlertService exports `checkAndAlertAfterSale()` for LINE notifications (used in inventory.js POST routes)

## Cross-System Communication

- **No direct API calls**: Frontend systems communicate only with their own backend
- **Shared Database**: Both backends read/write same Employee collection for auth
- **Token Portability**: Same JWT issued by both backends allows switching systems without re-login
- **Environment Separation**: Backends listen on different ports (5000 vs 5001) and configure baseURL distinctly in frontend .env

## Common Debugging Points

1. **Auth not working**: Check JWT_SECRET consistency between backends; verify token in localStorage
2. **Reorder alerts wrong**: Review STOCK_ALERT_FIX.md; ensure all calculations use 30-day window + `product.reorderBufferDays ?? 7`
3. **Port conflicts**: Ensure hr_system/backend (5000), stock_system/backend (5001), hr_system/frontend (3000), stock_system/frontend (5173) are available
4. **Variant not found**: Verify `selectVariant()` receives correct variantId/SKU; check if product.variants is populated
5. **Batch consumption off**: Trace `consumeBatches()` sorting logic (expiryDate FIFO) and quantity math in inventory.js

## Key Files to Reference

- **Workflow orchestration**: [root package.json](../package.json)
- **Shared models**: [Employee.js](../stock_system/backend/models/Employee.js)
- **Inventory logic**: [stock_system/backend/routes/inventory.js](../stock_system/backend/routes/inventory.js)
- **Reorder service**: [stock_system/backend/services/stockAlertService.js](../stock_system/backend/services/stockAlertService.js)
- **Frontend routing**: [stock_system/frontend/src/App.jsx](../stock_system/frontend/src/App.jsx)
- **Frontend API client**: [stock_system/frontend/src/api.js](../stock_system/frontend/src/api.js)
- **Standardization notes**: [STOCK_ALERT_FIX.md](../STOCK_ALERT_FIX.md)

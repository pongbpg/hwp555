# Stock System

Stock management service separated from HR, sharing the same employee/auth database.

## Structure
```
stock_system/
  backend/   # Express + Mongo (auth shared with HR)
  frontend/  # React + Vite SPA
```

## Backend
- Env: copy backend/.env.example to .env and set MONGODB_URI (same as HR) and JWT_SECRET (same as HR) so tokens work across apps.
- Scripts: `npm run dev` (nodemon), `npm start`.
- Endpoints:
  - Auth: `POST /api/auth/login`
  - Products: `GET/POST/PUT /api/products`
  - Inventory orders: `POST /api/inventory/orders` (purchase/sale/adjustment)
  - Insights: `GET /api/inventory/insights` (low stock, near expiry, fast movers, reorder suggestions)
- Models: Product with variants + batches (expiry), InventoryOrder, Employee (shared collection).

## Frontend
- Env: copy frontend/.env.example to .env and set `VITE_API_BASE_URL` (default http://localhost:6000/api).
- Scripts: `npm run dev`, `npm run build`, `npm run preview`.
- Pages: Login, Products (quick add/list), Orders (record purchase/sale/adjustment), Insights (low stock/expiry/fast movers).
- Uses JWT from shared auth; token stored in localStorage and passed as Bearer header.

## Quick start
```bash
# backend
cd stock_system/backend
npm install
cp .env.example .env
npm run dev

# frontend (new terminal)
cd stock_system/frontend
npm install
cp .env.example .env
npm run dev
```

Visit http://localhost:5173 and login with existing HR credentials (same Mongo collection).

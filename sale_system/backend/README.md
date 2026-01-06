# Sale System Backend

Sales management system with Facebook Messenger integration and stock tracking.

## Features

- **Facebook Integration**: Receive and respond to customer messages via Facebook Webhook
- **Order Management**: Create, track, and manage sales orders
- **Customer Management**: Track customer information and purchase history
- **Stock Integration**: Real-time inventory checks from stock_system
- **Shipping & Invoices**: Generate shipping slips and invoices
- **Sales Reports**: Track sales statistics and trends

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Create `.env` file:
```env
MONGODB_URI=mongodb://localhost:27017/sale_system
FACEBOOK_PAGE_ID=your_facebook_page_id
FACEBOOK_ACCESS_TOKEN=your_access_token
FACEBOOK_WEBHOOK_VERIFY_TOKEN=your_webhook_token
STOCK_SYSTEM_API_URL=http://localhost:5000/api
PORT=3002
NODE_ENV=development
```

### 3. Run Server
```bash
npm run dev
```

## API Endpoints

### Orders
- `POST /api/orders` - Create order
- `GET /api/orders` - Get all orders
- `GET /api/orders/:orderId` - Get order details
- `PATCH /api/orders/:orderId/status` - Update order status
- `GET /api/orders/:orderId/shipping-slip` - Generate shipping slip
- `GET /api/orders/:orderId/invoice` - Generate invoice

### Customers
- `POST /api/customers` - Create customer
- `GET /api/customers` - Get all customers
- `GET /api/customers/:id` - Get customer details
- `PUT /api/customers/:id` - Update customer
- `GET /api/customers/facebook/:facebookId` - Get by Facebook ID

### Products
- `GET /api/products/inventory/:productId` - Get inventory
- `GET /api/products/sku/:sku` - Get product by SKU

### Reports
- `GET /api/reports/sales-summary` - Sales summary
- `GET /api/reports/sales-by-date` - Sales by date range
- `GET /api/reports/top-customers` - Top customers
- `GET /api/reports/order-status` - Order status breakdown

### Webhook
- `GET /api/webhook/facebook` - Facebook webhook verification
- `POST /api/webhook/facebook` - Receive Facebook messages

# Sale System - ระบบจำหน่าย

A complete sales management system with Facebook Messenger integration and stock management capabilities.

## 📋 Features

### Core Features
- ✅ **Facebook Messenger Integration**: Receive and respond to customer messages via Webhook
- ✅ **Order Management**: Create, track, and manage sales orders
- ✅ **Customer Management**: Track customer information and purchase history
- ✅ **Real-time Stock Integration**: Check inventory from stock_system
- ✅ **Shipping Management**: Generate shipping slips and delivery notes
- ✅ **Invoice Generation**: Create and print invoices automatically
- ✅ **Sales Reports**: Track sales statistics and trends
- ✅ **Payment Tracking**: Monitor payment status and methods

### Order Management
- Create orders from Facebook chat or admin dashboard
- Track order status: pending → confirmed → packed → shipped → delivered
- Automatic stock deduction from stock_system
- Customer information management (name, phone, address)
- Multiple payment methods support

### Shipping & Documents
- **Shipping Slip**: Printable with customer address and items
- **Invoice**: Full invoice with tax calculation (7% VAT)
- **Order Tracking**: Real-time status updates

## 🏗️ Project Structure

```
sale_system/
├── backend/
│   ├── server.js                 # Express server
│   ├── package.json
│   ├── .env.example              # Environment configuration
│   ├── models/
│   │   ├── Customer.js           # Customer schema
│   │   ├── Order.js              # Order schema
│   │   └── Message.js            # Facebook message schema
│   ├── routes/
│   │   ├── facebook.js           # Webhook & messaging
│   │   ├── orders.js             # Order management
│   │   ├── customers.js          # Customer management
│   │   ├── products.js           # Stock integration
│   │   └── reports.js            # Analytics
│   ├── services/
│   │   ├── facebookService.js    # Facebook API
│   │   └── stockService.js       # Stock system integration
│   └── utils/
│       └── shippingSlip.js       # Document generation
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx               # Main app component
│   │   ├── api.js                # API client
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx     # Home dashboard
│   │   │   ├── Orders.jsx        # Orders list
│   │   │   ├── OrderDetail.jsx   # Order details & actions
│   │   │   ├── Customers.jsx     # Customer list
│   │   │   ├── Chat.jsx          # Facebook chat
│   │   │   └── Reports.jsx       # Analytics
│   │   └── components/
│   │       ├── Header.jsx
│   │       └── Sidebar.jsx
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── index.html
│
└── README.md                      # This file
```

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- MongoDB
- Stock System running (for inventory integration)
- Facebook Page & App (for Messenger integration)

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

**Backend runs on**: http://localhost:3002

#### Environment Variables
```env
MONGODB_URI=mongodb://localhost:27017/sale_system
FACEBOOK_PAGE_ID=your_facebook_page_id
FACEBOOK_ACCESS_TOKEN=your_facebook_access_token
FACEBOOK_WEBHOOK_VERIFY_TOKEN=your_webhook_token
STOCK_SYSTEM_API_URL=http://localhost:5000/api
PORT=3002
NODE_ENV=development
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

**Frontend runs on**: http://localhost:3003

## 📡 API Endpoints

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders` | Create new order |
| GET | `/api/orders` | Get all orders |
| GET | `/api/orders/:orderId` | Get order details |
| PATCH | `/api/orders/:orderId/status` | Update order status |
| GET | `/api/orders/:orderId/shipping-slip` | Generate shipping slip |
| GET | `/api/orders/:orderId/invoice` | Generate invoice |

### Customers
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/customers` | Create customer |
| GET | `/api/customers` | Get all customers |
| GET | `/api/customers/:id` | Get customer details |
| PUT | `/api/customers/:id` | Update customer |
| GET | `/api/customers/facebook/:facebookId` | Get by Facebook ID |

### Products & Inventory
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products/inventory/:productId` | Check inventory |
| GET | `/api/products/sku/:sku` | Get product by SKU |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/sales-summary` | Sales overview |
| GET | `/api/reports/sales-by-date` | Sales by date range |
| GET | `/api/reports/top-customers` | Top customers |
| GET | `/api/reports/order-status` | Order status breakdown |

### Webhook
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhook/facebook` | Facebook verification |
| POST | `/api/webhook/facebook` | Receive messages |

## 🔌 Facebook Integration Setup

### 1. Create Facebook App
1. Go to [Facebook Developers](https://developers.facebook.com)
2. Create a new app
3. Add Messenger product

### 2. Configure Webhook
1. In your app, go to Messenger → Settings
2. Set Webhook URL: `https://your-domain.com/api/webhook/facebook`
3. Set Verify Token (use the same in `.env`)
4. Subscribe to: `messages`, `messaging_postbacks`

### 3. Get Credentials
- **Page ID**: From Facebook Page Settings
- **Access Token**: Generate in Messenger → Settings
- **Webhook Token**: Your custom token

## 🗄️ Database Schema

### Customer
```javascript
{
  facebookId: String,        // Facebook User ID
  name: String,              // Customer name
  phone: String,             // Phone number
  address: String,           // Delivery address
  city: String,
  province: String,
  postalCode: String,
  email: String,
  facebookName: String,
  totalOrders: Number,
  totalSpent: Number,
  createdAt: Date
}
```

### Order
```javascript
{
  orderId: String,           // Order ID (SO + timestamp)
  customerId: ObjectId,      // Reference to customer
  customerName: String,
  customerPhone: String,
  shippingAddress: String,
  items: [{                  // Array of order items
    productId: String,
    sku: String,
    name: String,
    quantity: Number,
    price: Number,
    total: Number
  }],
  subtotal: Number,
  shippingFee: Number,
  taxAmount: Number,         // 7% VAT
  totalAmount: Number,
  status: String,            // pending, confirmed, packed, shipped, delivered
  paymentStatus: String,     // unpaid, partial, paid
  paymentMethod: String,
  notes: String,
  createdAt: Date
}
```

## 📊 Report Dashboard

The Reports page provides:
- **Sales Summary**: Total orders, today's orders, revenue
- **Top Customers**: Ranked by spending
- **Order Status**: Breakdown of order statuses
- **Sales Trends**: Daily/weekly/monthly analytics

## 🔐 Security

- Environment variables for sensitive data
- Facebook webhook token verification
- Input validation on all endpoints
- CORS enabled for frontend

## 🔧 Configuration

### Stock System Integration
The system automatically:
1. Checks inventory before creating orders
2. Prevents overselling
3. Creates inventory orders in stock_system
4. Updates stock on order creation

### Document Generation
- **Shipping Slip**: Ready to print with barcode
- **Invoice**: Full tax-compliant invoice
- Both support Thai language and currency (฿)

## 📈 Future Enhancements

- [ ] Real-time chat interface with Facebook
- [ ] Automated email notifications
- [ ] SMS notifications for order updates
- [ ] Advanced analytics and charts
- [ ] Inventory alerts
- [ ] Multi-warehouse support
- [ ] Payment gateway integration (2C2P, Stripe)
- [ ] Mobile app
- [ ] Order templates and presets
- [ ] Customer segmentation

## 📝 Development

### Running Both Services
```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev

# Terminal 3 - MongoDB (if local)
mongod
```

### Testing
```bash
# Backend
npm run test

# Frontend
npm run test
```

## 🐛 Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running
- Check connection string in `.env`

### Facebook Webhook Not Receiving
- Verify webhook URL is publicly accessible
- Check Verify Token matches in Facebook settings
- Ensure POST is allowed on webhook endpoint

### Stock Integration Error
- Verify stock_system API URL in `.env`
- Check stock_system is running on correct port

## 📄 License

MIT

## 🤝 Support

For issues or feature requests, please create an issue in the repository.

---

**Created**: January 2026  
**Last Updated**: January 6, 2026

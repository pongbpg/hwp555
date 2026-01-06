# Sale System Frontend

React-based frontend for sales management system.

## Features

- **Dashboard**: Overview of sales metrics
- **Orders Management**: View, create, and manage orders
- **Customer Management**: Track customer information and history
- **Reports & Analytics**: Sales trends and statistics
- **Facebook Chat**: View customer messages from Facebook
- **Shipping & Invoices**: Generate and print documents

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```

Frontend will be available at `http://localhost:3003`

### 3. Build for Production
```bash
npm run build
```

## Configuration

The frontend connects to the backend API at `http://localhost:3002/api` by default. This can be configured in the Vite proxy settings in `vite.config.js`.

## Components

- **Header**: Navigation and user profile
- **Sidebar**: Main navigation menu
- **Dashboard**: Sales overview and statistics
- **Orders**: Order list and management
- **OrderDetail**: Detailed order view with actions
- **Customers**: Customer list and history
- **Chat**: Facebook Messenger integration
- **Reports**: Analytics and reports

## Available Routes

- `/` - Dashboard
- `/orders` - Orders list
- `/orders/:orderId` - Order details
- `/customers` - Customers list
- `/chat` - Facebook chat
- `/reports` - Reports and analytics

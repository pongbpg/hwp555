import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_SALE_API_BASE_URL || 'http://localhost:5002/api',
})

export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`
  } else {
    delete api.defaults.headers.common.Authorization
  }
}

// Orders
export const orderApi = {
  create: (data) => api.post('/orders', data),
  getAll: () => api.get('/orders'),
  getById: (orderId) => api.get(`/orders/${orderId}`),
  updateStatus: (orderId, status) => api.patch(`/orders/${orderId}/status`, { status }),
  getShippingSlip: (orderId) => api.get(`/orders/${orderId}/shipping-slip`),
  getInvoice: (orderId) => api.get(`/orders/${orderId}/invoice`)
}

// Customers
export const customerApi = {
  create: (data) => api.post('/customers', data),
  getAll: () => api.get('/customers'),
  getById: (id) => api.get(`/customers/${id}`),
  update: (id, data) => api.put(`/customers/${id}`, data),
  getByFacebookId: (facebookId) => api.get(`/customers/facebook/${facebookId}`)
}

// Products
export const productApi = {
  getInventory: (productId) => api.get(`/products/inventory/${productId}`),
  getBySku: (sku) => api.get(`/products/sku/${sku}`)
}

// Reports
export const reportApi = {
  getSalesSummary: () => api.get('/reports/sales-summary'),
  getSalesByDate: (startDate, endDate) => api.get('/reports/sales-by-date', { params: { startDate, endDate } }),
  getTopCustomers: (limit) => api.get('/reports/top-customers', { params: { limit } }),
  getOrderStatus: () => api.get('/reports/order-status')
}

export default api

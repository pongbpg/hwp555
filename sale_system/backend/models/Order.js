import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  productId: String,
  sku: String,
  name: String,
  quantity: Number,
  price: Number,
  total: Number
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  customerName: String,
  customerPhone: String,
  customerEmail: String,
  shippingAddress: String,
  shippingCity: String,
  shippingProvince: String,
  shippingPostalCode: String,
  
  items: [orderItemSchema],
  
  subtotal: Number,
  shippingFee: {
    type: Number,
    default: 0
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  taxAmount: {
    type: Number,
    default: 0
  },
  totalAmount: Number,
  
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partial', 'paid'],
    default: 'unpaid'
  },
  paymentMethod: String,
  
  facebookConversationId: String,
  notes: String,
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  shippedAt: Date,
  deliveredAt: Date
});

export default mongoose.model('Order', orderSchema);

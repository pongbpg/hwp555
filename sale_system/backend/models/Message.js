import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  facebookMessageId: String,
  facebookConversationId: String,
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  senderType: {
    type: String,
    enum: ['customer', 'admin'],
    default: 'customer'
  },
  content: String,
  attachments: [{
    type: String,
    url: String
  }],
  messageType: {
    type: String,
    enum: ['text', 'image', 'product', 'order_status'],
    default: 'text'
  },
  relatedOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Message', messageSchema);

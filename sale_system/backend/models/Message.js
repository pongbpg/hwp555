import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true
    },
    pageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Page',
      required: true,
      index: true
    },
    facebookMessageId: String,
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer'
    },
    sender: {
      type: String,
      enum: ['customer', 'admin'],
      default: 'customer'
    },
    senderName: String,
    senderFacebookId: String,
    content: String,
    attachments: [
      {
        type: String,
        url: String
      }
    ],
    messageType: {
      type: String,
      enum: ['text', 'image', 'product', 'order_status', 'attachment'],
      default: 'text'
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent'
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
      default: Date.now,
      index: true
    }
  },
  { timestamps: false }
);

// Index for fetching message history
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ pageId: 1, createdAt: -1 });

export default mongoose.model('Message', messageSchema);


import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    pageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Page',
      required: true,
      index: true
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true
    },
    facebookConversationId: {
      type: String,
      required: true,
      index: true
    },
    facebookParticipantId: String,
    customerName: String,
    customerProfilePicUrl: String,
    lastMessage: String,
    lastMessageType: {
      type: String,
      enum: ['text', 'image', 'attachment'],
      default: 'text'
    },
    isOpen: {
      type: Boolean,
      default: true,
      index: true
    },
    unreadCount: {
      type: Number,
      default: 0
    },
    messageCount: {
      type: Number,
      default: 0
    },
    participantFacebookIds: [String],
    tags: [String], // For categorizing conversations
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    relatedOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    closedAt: Date
  },
  { timestamps: true }
);

// Index for sorting conversations by page and last message time
conversationSchema.index({ pageId: 1, lastMessageAt: -1 });
conversationSchema.index({ pageId: 1, isOpen: 1, lastMessageAt: -1 });
conversationSchema.index({ customerId: 1, pageId: 1 });

export default mongoose.model('Conversation', conversationSchema);

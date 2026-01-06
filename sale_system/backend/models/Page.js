import mongoose from 'mongoose';
import crypto from 'crypto';

const pageSchema = new mongoose.Schema(
  {
    pageId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    pageName: {
      type: String,
      required: true
    },
    pageAccessToken: {
      type: String,
      required: true,
      // Stored encrypted in DB
      set: function(token) {
        if (!token) return token;
        const encryptionSecret = process.env.ENCRYPTION_SECRET || 'default-secret-key-change-in-env';
        const cipher = crypto.createCipher('aes-256-cbc', encryptionSecret);
        let encrypted = cipher.update(token, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
      }
    },
    category: {
      type: String,
      default: 'business'
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    },
    webhookVerifyToken: {
      type: String,
      required: true
    },
    profilePicUrl: String,
    conversationCount: {
      type: Number,
      default: 0
    },
    unreadCount: {
      type: Number,
      default: 0
    },
    lastMessageAt: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    lastSyncAt: Date
  },
  { timestamps: true }
);

// Virtual getter to decrypt token
pageSchema.virtual('decryptedAccessToken').get(function() {
  if (!this.pageAccessToken) return null;
  try {
    const encryptionSecret = process.env.ENCRYPTION_SECRET || 'default-secret-key-change-in-env';
    const decipher = crypto.createDecipher('aes-256-cbc', encryptionSecret);
    let decrypted = decipher.update(this.pageAccessToken, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Error decrypting page token:', error);
    return null;
  }
});

// Ensure virtuals are included in JSON
pageSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Page', pageSchema);

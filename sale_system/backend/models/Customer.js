import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
  facebookId: {
    type: String,
    unique: true,
    sparse: true
  },
  name: String,
  phone: String,
  address: String,
  city: String,
  province: String,
  postalCode: String,
  email: String,
  facebookName: String,
  facebookProfileUrl: String,
  totalOrders: {
    type: Number,
    default: 0
  },
  totalSpent: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Customer', customerSchema);

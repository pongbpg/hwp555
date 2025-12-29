import mongoose from 'mongoose';

const { Schema } = mongoose;

const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: String,
    variantId: { type: Schema.Types.ObjectId, required: true },
    sku: String,
    quantity: { type: Number, required: true },
    receivedQuantity: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    batchRef: String,
    expiryDate: Date,
    notes: String,
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    type: { type: String, enum: ['sale', 'purchase', 'adjustment'], required: true },
    status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'completed' },
    orderDate: { type: Date, default: Date.now },
    reference: String,
    channel: String,
    notes: String,
    totals: {
      subTotal: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      grandTotal: { type: Number, default: 0 },
    },
    placedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    metadata: { type: Map, of: String },
    items: { type: [orderItemSchema], validate: [(val) => val.length > 0, 'At least one item is required'] },
  },
  { timestamps: true }
);

export default mongoose.model('InventoryOrder', orderSchema);

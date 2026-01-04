import mongoose from 'mongoose';

const { Schema } = mongoose;

const batchSchema = new Schema(
  {
    batchRef: String,
    supplier: String,
    cost: Number,
    quantity: { type: Number, required: true },
    expiryDate: Date,
    receivedAt: { type: Date, default: Date.now },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryOrder' },
  },
  { _id: true }
);

const variantSchema = new Schema(
  {
    name: String,
    sku: { type: String, required: true },
    barcode: String,
    model: String,
    attributes: { type: Map, of: String, default: {} },
    price: { type: Number, default: 0 },
    cost: { type: Number, default: 0 },
    stockOnHand: { type: Number, default: 0 },
    committed: { type: Number, default: 0 },
    incoming: { type: Number, default: 0 },
    reorderPoint: { type: Number, default: 0 },
    reorderQty: { type: Number, default: 0 },
    allowBackorder: { type: Boolean, default: false },
    batches: { type: [batchSchema], default: [] },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { _id: true }
);

variantSchema.virtual('available').get(function () {
  return (this.stockOnHand || 0) - (this.committed || 0);
});

variantSchema.virtual('totalBatchQuantity').get(function () {
  return (this.batches || []).reduce((sum, batch) => sum + (batch.quantity || 0), 0);
});

// Virtual สำหรับตรวจสอบสต็อกต่ำ
variantSchema.virtual('isLowStock').get(function () {
  const threshold = this.reorderPoint || 0;
  return (this.stockOnHand || 0) <= threshold;
});

variantSchema.virtual('stockStatus').get(function () {
  const stock = this.stockOnHand || 0;
  const reorder = this.reorderPoint || 0;
  if (stock <= 0) return 'out-of-stock';
  if (stock <= reorder) return 'low-stock';
  if (stock <= reorder * 2) return 'warning';
  return 'in-stock';
});

variantSchema.set('toObject', { virtuals: true });
variantSchema.set('toJSON', { virtuals: true });

const productSchema = new Schema(
  {
    name: { type: String, required: true },
    sku: { type: String },
    description: String,
    category: String,
    brand: String,
    unit: { type: String, default: 'unit' },
    tags: [String],
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    attributesSchema: [
      {
        key: String,
        label: String,
        inputType: { type: String, enum: ['text', 'number', 'select', 'textarea'], default: 'text' },
        options: [String],
      },
    ],
    variants: { type: [variantSchema], default: [] },
    skuProduct: { type: String, default: '' },
    costingMethod: {
      type: String,
      enum: ['FIFO', 'LIFO', 'WAC'],
      default: 'FIFO',
      description: 'FIFO=First In First Out, LIFO=Last In First Out, WAC=Weighted Average Cost',
    },
    leadTimeDays: { type: Number, default: 7 },
    reorderBufferDays: { type: Number, default: 7 },
    minOrderQty: { type: Number, default: 0 },
    enableStockAlerts: { type: Boolean, default: true, description: 'เปิดปิดการแจ้งเตือนสต็อกต่ำ' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
  },
  { timestamps: true }
);

productSchema.virtual('variantCount').get(function () {
  return this.variants?.length || 0;
});

productSchema.index({ sku: 1 }, { unique: true, sparse: true });
productSchema.index({ 'variants.sku': 1 });

export default mongoose.model('Product', productSchema);

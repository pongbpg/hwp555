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
    // ✅ เก็บต้นทุนของแต่ละ item เพื่อใช้ตอนยกเลิก
    unitCost: { type: Number, default: 0 },
    // ✅ สำหรับ adjustment: เก็บ delta ที่เปลี่ยนแปลงจริง (targetStock - currentStock)
    actualDelta: { type: Number },
    batchRef: String,
    expiryDate: Date,
    supplier: String, // ✅ ชื่อผู้จัดจำหน่าย/แหล่งที่มา
    notes: String,
  },
  { _id: false }
);

// Receipt history for tracking each receive transaction
const receiptSchema = new Schema(
  {
    itemIndex: { type: Number, required: true }, // ชี้ไปที่ items array index
    quantity: { type: Number, required: true },
    batchRef: String,
    supplier: String,
    expiryDate: Date,
    unitCost: { type: Number, default: 0 },
    receivedAt: { type: Date, default: Date.now },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    status: { type: String, enum: ['completed', 'cancelled'], default: 'completed' },
    notes: String,
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    type: { type: String, enum: ['sale', 'purchase', 'adjustment', 'damage', 'expired', 'return'], required: true },
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
    // ✅ ประวัติการรับสินค้า (สำหรับ purchase orders)
    receipts: { type: [receiptSchema], default: [] },
  },
  { timestamps: true }
);

// ✅ Virtual field: aggregated receivedQuantity from receipts (สำหรับ purchase orders)
// ข้าม receipts ที่ cancelled และรวมปริมาณที่รับได้จริง
orderSchema.virtual('aggregatedReceivedQuantity').get(function() {
  if (this.type !== 'purchase') return null;
  
  const itemReceipts = new Map();
  
  // Group receipts by itemIndex and sum quantities
  (this.receipts || []).forEach((receipt) => {
    if (receipt.status === 'completed') { // ข้าม cancelled receipts
      const key = receipt.itemIndex;
      if (!itemReceipts.has(key)) {
        itemReceipts.set(key, 0);
      }
      itemReceipts.set(key, itemReceipts.get(key) + receipt.quantity);
    }
  });
  
  return itemReceipts;
});

export default mongoose.model('InventoryOrder', orderSchema);

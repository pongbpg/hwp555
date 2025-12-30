import mongoose from 'mongoose';

const { Schema } = mongoose;

const stockMovementSchema = new Schema(
  {
    // ประเภทการเคลื่อนไหว
    movementType: {
      type: String,
      enum: ['in', 'out', 'adjust', 'transfer', 'return', 'damage', 'expired'],
      required: true,
    },
    // รายละเอียดสินค้า
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true },
    // จำนวน (+ เข้า, - ออก)
    quantity: { type: Number, required: true },
    // สต็อกก่อนและหลัง
    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    // ข้อมูลอ้างอิง
    orderId: { type: Schema.Types.ObjectId, ref: 'InventoryOrder' },
    reference: { type: String }, // เลขที่อ้างอิง เช่น เลขใบสั่งซื้อ
    reason: { type: String }, // เหตุผล เช่น เสียหาย, หมดอายุ
    notes: { type: String },
    // ข้อมูล Batch (ถ้ามี)
    batchRef: { type: String },
    expiryDate: { type: Date },
    // ราคาต้นทุน ณ เวลานั้น
    unitCost: { type: Number, default: 0 },
    // ผู้ดำเนินการ
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    createdByName: { type: String },
  },
  { timestamps: true }
);

// Index สำหรับการค้นหาที่รวดเร็ว
stockMovementSchema.index({ productId: 1, createdAt: -1 });
stockMovementSchema.index({ variantId: 1, createdAt: -1 });
stockMovementSchema.index({ sku: 1, createdAt: -1 });
stockMovementSchema.index({ movementType: 1, createdAt: -1 });
stockMovementSchema.index({ createdAt: -1 });

// Virtual สำหรับแสดงประเภทเป็นภาษาไทย
stockMovementSchema.virtual('movementTypeLabel').get(function () {
  const labels = {
    in: 'รับเข้า',
    out: 'จ่ายออก',
    adjust: 'ปรับปรุง',
    transfer: 'โอนย้าย',
    return: 'รับคืน',
    damage: 'เสียหาย',
    expired: 'หมดอายุ',
  };
  return labels[this.movementType] || this.movementType;
});

stockMovementSchema.set('toObject', { virtuals: true });
stockMovementSchema.set('toJSON', { virtuals: true });

export default mongoose.model('StockMovement', stockMovementSchema);

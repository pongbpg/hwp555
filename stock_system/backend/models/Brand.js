import mongoose from 'mongoose';

const { Schema } = mongoose;

const brandSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    prefix: { type: String, default: '', trim: true, uppercase: true },
    description: { type: String, default: '' },
    createdBy: { type: mongoose.Types.ObjectId, ref: 'Employee' },
    updatedBy: { type: mongoose.Types.ObjectId, ref: 'Employee' },
  },
  { timestamps: true }
);

export default mongoose.model('Brand', brandSchema);

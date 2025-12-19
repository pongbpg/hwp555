import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: String,
    position: { type: String, required: true },
    department: { type: String, required: true },
    salary: { type: Number, required: true },
    hireDate: { type: Date, required: true },
    status: { type: String, enum: ['active', 'inactive', 'on-leave'], default: 'active' },
    password: { type: String, required: true },
    role: { type: String, enum: ['owner', 'admin', 'hr', 'accountant', 'employee'], default: 'employee' },
  },
  { timestamps: true }
);

export default mongoose.model('Employee', employeeSchema);

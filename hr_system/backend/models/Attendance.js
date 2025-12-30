import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      // For multi-day leave requests
    },
    leaveType: {
      type: String,
      enum: ['annual', 'sick', 'personal'],
      required: true,
    },
    isHalfDay: {
      type: Boolean,
      default: false,
      // Only allowed for sick and personal leave
    },
    halfDayPeriod: {
      type: String,
      enum: ['morning', 'afternoon'],
      // Required if isHalfDay is true
    },
    reason: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    },
    approvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual to calculate leave days
attendanceSchema.virtual('leaveDays').get(function() {
  if (this.isHalfDay) return 0.5;
  if (!this.endDate) return 1;
  const start = new Date(this.date);
  const end = new Date(this.endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
});

attendanceSchema.set('toJSON', { virtuals: true });
attendanceSchema.set('toObject', { virtuals: true });

export default mongoose.model('Attendance', attendanceSchema);

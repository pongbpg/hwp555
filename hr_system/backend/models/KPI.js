import mongoose from 'mongoose';

const kpiSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    month: {
      type: String,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    metrics: {
      productivity: {
        type: Number,
        min: 0,
        max: 100,
      },
      quality: {
        type: Number,
        min: 0,
        max: 100,
      },
      teamwork: {
        type: Number,
        min: 0,
        max: 100,
      },
      punctuality: {
        type: Number,
        min: 0,
        max: 100,
      },
    },
    comments: {
      type: String,
    },
    evaluatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('KPI', kpiSchema);

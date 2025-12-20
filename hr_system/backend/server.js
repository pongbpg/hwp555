import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import employeeRoutes from './routes/employees.js';
import attendanceRoutes from './routes/attendance.js';
import kpiRoutes from './routes/kpi.js';
import salaryRoutes from './routes/salary.js';
import authRoutes from './routes/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from root directory
dotenv.config({ path: join(__dirname, '../../.env') });

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const mongoUri = process.env.MONGODB_URI;
mongoose.connect(mongoUri)
  .then(() => console.log('MongoDB connected for HR system'))
  .catch(err => console.log('MongoDB connection error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/kpi', kpiRoutes);
app.use('/api/salary', salaryRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.HR_PORT || 5000;
const HOST = process.env.HR_HOST || 'localhost';
app.listen(PORT, HOST, () => {
  console.log(`🚀 HR System Backend running on http://${HOST}:${PORT}`);
});

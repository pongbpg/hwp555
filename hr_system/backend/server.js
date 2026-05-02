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
import testRoutes from './routes/test.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load shared .env from root first, then system-specific .env
dotenv.config({ path: join(__dirname, '../../.env') });
dotenv.config({ path: join(__dirname, '.env') });

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database connection with retry
const mongoUri = process.env.MONGODB_URI;

const connectWithRetry = (attempt = 1) => {
  const maxDelay = 30000;
  mongoose.connect(mongoUri)
    .then(() => console.log('MongoDB connected for HR system'))
    .catch(err => {
      const delay = Math.min(1000 * 2 ** attempt, maxDelay);
      console.error(`MongoDB connection error (attempt ${attempt}), retrying in ${delay / 1000}s:`, err.message);
      setTimeout(() => connectWithRetry(attempt + 1), delay);
    });
};

connectWithRetry();

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected — attempting reconnect...');
  connectWithRetry();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/kpi', kpiRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/test', testRoutes); // Test routes (no authentication required)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Listen on all interfaces for Docker
app.listen(PORT, HOST, () => {
  console.log(`🚀 HR System Backend running on http://0.0.0.0:${PORT}`);
});

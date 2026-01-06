import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import facebookRoutes from './routes/facebook.js';
import orderRoutes from './routes/orders.js';
import customerRoutes from './routes/customers.js';
import productRoutes from './routes/products.js';
import reportRoutes from './routes/reports.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from root directory
dotenv.config({ path: join(__dirname, '../../.env') });

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI;
mongoose
  .connect(mongoUri)
  .then(() => console.log('MongoDB connected for Sale System'))
  .catch((err) => console.error('Mongo connection error:', err));

// Routes
app.use('/api/webhook', facebookRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/reports', reportRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.SALE_PORT || 5002;
const HOST = process.env.SALE_HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`🚀 Sale System Backend running on http://${HOST}:${PORT}`);
});

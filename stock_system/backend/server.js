import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import productRoutes from './routes/products.js';
import inventoryRoutes from './routes/inventory.js';
import categoryRoutes from './routes/categories.js';
import brandRoutes from './routes/brands.js';
import movementRoutes from './routes/movements.js';
import lineRoutes from './routes/line.js';
import debugInsightsRoutes from './routes/debug-insights.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load shared .env from root first, then system-specific .env
dotenv.config({ path: join(__dirname, '../../.env') });
dotenv.config({ path: join(__dirname, '.env') });

const app = express();

app.use(cors());
app.use(express.json());

const mongoUri = process.env.MONGODB_URI;

const connectWithRetry = (attempt = 1) => {
  const maxDelay = 30000;
  mongoose.connect(mongoUri)
    .then(() => console.log('MongoDB connected for stock system'))
    .catch((err) => {
      const delay = Math.min(1000 * 2 ** attempt, maxDelay);
      console.error(`Mongo connection error (attempt ${attempt}), retrying in ${delay / 1000}s:`, err.message);
      setTimeout(() => connectWithRetry(attempt + 1), delay);
    });
};

connectWithRetry();

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected — attempting reconnect...');
  connectWithRetry();
});

app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/movements', movementRoutes);
app.use('/api/line', lineRoutes);
app.use('/api/debug', debugInsightsRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'stock-system' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5001;
const HOST = '0.0.0.0'; // Listen on all interfaces for Docker
app.listen(PORT, HOST, () => {
  console.log(`🚀 Stock System Backend running on http://0.0.0.0:${PORT}`);
  console.log(`📊 Stock Dashboard: http://localhost:${process.env.FRONTEND_PORT || PORT - 1000}/dashboard`);
  console.log(`🚀 Stock System Backend running on http://${HOST}:${PORT}`);
});

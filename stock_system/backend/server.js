import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import inventoryRoutes from './routes/inventory.js';
import categoryRoutes from './routes/categories.js';
import brandRoutes from './routes/brands.js';
import movementRoutes from './routes/movements.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from root directory
dotenv.config({ path: join(__dirname, '../../.env') });

const app = express();

app.use(cors());
app.use(express.json());

const mongoUri = process.env.MONGODB_URI;
mongoose
  .connect(mongoUri)
  .then(() => console.log('MongoDB connected for stock system'))
  .catch((err) => console.error('Mongo connection error:', err));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/movements', movementRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'stock-system' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.STOCK_PORT || 5001;
const HOST = process.env.STOCK_HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`🚀 Stock System Backend running on http://${HOST}:${PORT}`);
});

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

import facebookRoutes from './routes/facebook.js';
import orderRoutes from './routes/orders.js';
import customerRoutes from './routes/customers.js';
import productRoutes from './routes/products.js';
import reportRoutes from './routes/reports.js';
import pagesRoutes from './routes/pages.js';
import conversationsRoutes from './routes/conversations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load shared .env from root first, then system-specific .env
dotenv.config({ path: join(__dirname, '../../.env') });
dotenv.config({ path: join(__dirname, '.env') });

const app = express();

// Create HTTP server for Socket.io
const server = http.createServer(app);

// Socket.io setup
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.SOCKET_IO_CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 20000
});

// Socket.io middleware for authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    console.warn('Socket connection without token');
    // Allow connection but mark as unauthenticated
    socket.authenticated = false;
    return next();
  }
  // Token verification can be added here
  socket.authenticated = true;
  socket.userId = socket.handshake.auth.userId;
  next();
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}, Authenticated: ${socket.authenticated}`);

  // Join page-specific room
  socket.on('join-page', (data) => {
    const { pageId } = data;
    if (!pageId) return;
    socket.join(`page:${pageId}`);
    console.log(`✅ Socket ${socket.id} joined page:${pageId}`);
    
    // Notify others that user joined
    io.to(`page:${pageId}`).emit('user-joined', {
      pageId,
      socketId: socket.id,
      timestamp: new Date()
    });
  });

  // Leave page room
  socket.on('leave-page', (data) => {
    const { pageId } = data;
    if (!pageId) return;
    socket.leave(`page:${pageId}`);
    console.log(`👋 Socket ${socket.id} left page:${pageId}`);
    
    io.to(`page:${pageId}`).emit('user-left', {
      pageId,
      socketId: socket.id,
      timestamp: new Date()
    });
  });

  // Join conversation room
  socket.on('join-conversation', (data) => {
    const { conversationId, pageId } = data;
    if (!conversationId) return;
    socket.join(`conversation:${conversationId}`);
    console.log(`✅ Socket ${socket.id} joined conversation:${conversationId}`);
  });

  // Leave conversation room
  socket.on('leave-conversation', (data) => {
    const { conversationId } = data;
    if (!conversationId) return;
    socket.leave(`conversation:${conversationId}`);
    console.log(`👋 Socket ${socket.id} left conversation:${conversationId}`);
  });

  // Handle typing indicator
  socket.on('typing', (data) => {
    const { conversationId, userName, pageId } = data;
    io.to(`conversation:${conversationId}`).emit('user-typing', {
      conversationId,
      userName,
      pageId,
      socketId: socket.id,
      timestamp: new Date()
    });
  });

  // Handle stop typing
  socket.on('stop-typing', (data) => {
    const { conversationId, pageId } = data;
    io.to(`conversation:${conversationId}`).emit('user-stop-typing', {
      conversationId,
      pageId,
      socketId: socket.id
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });

  socket.on('error', (error) => {
    console.error(`⚠️  Socket error [${socket.id}]:`, error);
  });
});

// Make io accessible to routes
app.set('io', io);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files (Privacy Policy, etc.)
app.use(express.static(join(__dirname, 'public')));

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI;
mongoose
  .connect(mongoUri)
  .then(() => console.log('MongoDB connected for Sale System'))
  .catch((err) => console.error('Mongo connection error:', err));

// Routes
app.use('/api/webhook', facebookRoutes);
app.use('/api/facebook', facebookRoutes); // Mount facebook routes for non-webhook endpoints
app.use('/api/orders', orderRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/pages', pagesRoutes);
app.use('/api/conversations', conversationsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 5002;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`🚀 Sale System Backend running on http://${HOST}:${PORT}`);
  console.log(`📡 WebSocket/Socket.io ready for connections`);
});

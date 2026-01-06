import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import Order from '../models/Order.js';
import Customer from '../models/Customer.js';
import { createInventoryOrder, checkStockAvailability } from '../services/stockService.js';
import { generateShippingSlipHTML, generateInvoiceHTML } from '../utils/shippingSlip.js';

const router = express.Router();

// Create new order
router.post('/', async (req, res) => {
  try {
    const { customerId, customerName, customerPhone, customerEmail, shippingAddress, shippingCity, shippingProvince, shippingPostalCode, items, notes } = req.body;

    // Check stock availability
    const availability = await checkStockAvailability(items);
    const allAvailable = availability.every(a => a.isAvailable);

    if (!allAvailable) {
      return res.status(400).json({
        error: 'Stock not available for some items',
        availability
      });
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const shippingFee = 0;
    const discountAmount = 0;
    const taxAmount = subtotal * 0.07; // 7% VAT
    const totalAmount = subtotal + shippingFee + taxAmount - discountAmount;

    // Create order
    const orderId = `SO${Date.now()}`;
    const order = new Order({
      orderId,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      shippingAddress,
      shippingCity,
      shippingProvince,
      shippingPostalCode,
      items,
      subtotal,
      shippingFee,
      discountAmount,
      taxAmount,
      totalAmount,
      notes
    });

    await order.save();

    // Create inventory order in stock system
    try {
      await createInventoryOrder({
        orderId,
        items
      });
    } catch (error) {
      console.error('Warning: Failed to create inventory order:', error);
    }

    // Update customer stats
    if (customerId) {
      await Customer.findByIdAndUpdate(customerId, {
        $inc: { totalOrders: 1, totalSpent: totalAmount }
      });
    }

    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get orders
router.get('/', async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('customerId')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get order by ID
router.get('/:orderId', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId })
      .populate('customerId');
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update order status
router.patch('/:orderId/status', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findOneAndUpdate(
      { orderId: req.params.orderId },
      { status, updatedAt: new Date() },
      { new: true }
    );
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate shipping slip
router.get('/:orderId/shipping-slip', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    const html = generateShippingSlipHTML(order);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate invoice
router.get('/:orderId/invoice', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    const html = generateInvoiceHTML(order);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

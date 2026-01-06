import express from 'express';
import Order from '../models/Order.js';
import Customer from '../models/Customer.js';

const router = express.Router();

// Sales summary
router.get('/sales-summary', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalOrders = await Order.countDocuments();
    const todayOrders = await Order.countDocuments({ createdAt: { $gte: today } });
    
    const totalSales = await Order.aggregate([
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    const todaySales = await Order.aggregate([
      { $match: { createdAt: { $gte: today } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    res.json({
      totalOrders,
      todayOrders,
      totalSales: totalSales[0]?.total || 0,
      todaySales: todaySales[0]?.total || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sales by date range
router.get('/sales-by-date', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const sales = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          total: { $sum: '$totalAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json(sales);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Top customers
router.get('/top-customers', async (req, res) => {
  try {
    const limit = req.query.limit || 10;
    const customers = await Customer.find()
      .sort({ totalSpent: -1 })
      .limit(parseInt(limit));
    res.json(customers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Order status breakdown
router.get('/order-status', async (req, res) => {
  try {
    const statusBreakdown = await Order.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$totalAmount' }
        }
      }
    ]);
    res.json(statusBreakdown);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

import express from 'express';
import { getProductInventory, getProductBySkU } from '../services/stockService.js';

const router = express.Router();

// Get product inventory from stock system
router.get('/inventory/:productId', async (req, res) => {
  try {
    const inventory = await getProductInventory(req.params.productId);
    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get product by SKU from stock system
router.get('/sku/:sku', async (req, res) => {
  try {
    const product = await getProductBySkU(req.params.sku);
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

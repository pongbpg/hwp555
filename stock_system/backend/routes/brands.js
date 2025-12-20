import express from 'express';
import Brand from '../models/Brand.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// Get all brands
router.get('/', authenticateToken, async (req, res) => {
  try {
    const brands = await Brand.find().sort({ name: 1 }).lean();
    res.json(brands);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single brand
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id).lean();
    if (!brand) return res.status(404).json({ error: 'Brand not found' });
    res.json(brand);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create brand
router.post('/', authenticateToken, authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const { name, prefix, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const existingBrand = await Brand.findOne({ name });
    if (existingBrand) {
      return res.status(409).json({ error: 'Brand already exists' });
    }

    const brand = new Brand({
      name: name.trim(),
      prefix: (prefix || '').toUpperCase().trim(),
      description: description || '',
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });

    await brand.save();
    res.status(201).json(brand);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update brand
router.put('/:id', authenticateToken, authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const { name, prefix, description } = req.body;

    if (name) {
      const existingBrand = await Brand.findOne({ name, _id: { $ne: req.params.id } });
      if (existingBrand) {
        return res.status(409).json({ error: 'Brand name already exists' });
      }
    }

    const updateData = { updatedBy: req.user?._id };
    if (name) updateData.name = name.trim();
    if (prefix !== undefined) updateData.prefix = prefix.toUpperCase().trim();
    if (description !== undefined) updateData.description = description;

    const brand = await Brand.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    res.json(brand);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete brand
router.delete('/:id', authenticateToken, authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const brand = await Brand.findByIdAndDelete(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });
    res.json({ message: 'Brand deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

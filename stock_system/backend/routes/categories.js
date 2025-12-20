import express from 'express';
import Category from '../models/Category.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// Get all categories
router.get('/', authenticateToken, async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 }).lean();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single category
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).lean();
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create category
router.post('/', authenticateToken, authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const { name, prefix, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(409).json({ error: 'Category already exists' });
    }

    const category = new Category({
      name: name.trim(),
      prefix: (prefix || '').toUpperCase().trim(),
      description: description || '',
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });

    await category.save();
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update category
router.put('/:id', authenticateToken, authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const { name, prefix, description } = req.body;

    if (name) {
      const existingCategory = await Category.findOne({ name, _id: { $ne: req.params.id } });
      if (existingCategory) {
        return res.status(409).json({ error: 'Category name already exists' });
      }
    }

    const updateData = { updatedBy: req.user?._id };
    if (name) updateData.name = name.trim();
    if (prefix !== undefined) updateData.prefix = prefix.toUpperCase().trim();
    if (description !== undefined) updateData.description = description;

    const category = await Category.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!category) return res.status(404).json({ error: 'Category not found' });

    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete category
router.delete('/:id', authenticateToken, authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

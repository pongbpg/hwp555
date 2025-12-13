import express from 'express';
import KPI from '../models/KPI.js';
import Employee from '../models/Employee.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// Get all KPI records
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { employeeId, month, year } = req.query;
    let query = {};

    if (employeeId) query.employeeId = employeeId;
    if (month) query.month = month;
    if (year) query.year = parseInt(year);

    const kpis = await KPI.find(query).populate('employeeId', 'firstName lastName email');
    res.json(kpis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get KPI by employee
router.get('/employee/:id', authenticateToken, async (req, res) => {
  try {
    const kpis = await KPI.find({ employeeId: req.params.id }).populate('employeeId');
    res.json(kpis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create KPI record
router.post('/', authenticateToken, authorizeRoles('owner', 'admin', 'accountant'), async (req, res) => {
  try {
    const { employeeId, month, year, metrics, comments } = req.body;

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const { productivity, quality, teamwork, punctuality } = metrics;
    const score = (parseFloat(productivity) + parseFloat(quality) + parseFloat(teamwork) + parseFloat(punctuality)) / 4;

    const kpi = new KPI({
      employeeId,
      month,
      year,
      metrics: {
        productivity: parseFloat(productivity) || 0,
        quality: parseFloat(quality) || 0,
        teamwork: parseFloat(teamwork) || 0,
        punctuality: parseFloat(punctuality) || 0,
      },
      score,
      comments,
    });

    await kpi.save();
    await kpi.populate('employeeId', 'firstName lastName');
    res.status(201).json(kpi);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update KPI
router.put('/:id', authenticateToken, authorizeRoles('owner', 'admin', 'accountant'), async (req, res) => {
  try {
    const { metrics, comments } = req.body;

    const { productivity, quality, teamwork, punctuality } = metrics;
    const score = (parseFloat(productivity) + parseFloat(quality) + parseFloat(teamwork) + parseFloat(punctuality)) / 4;

    const kpi = await KPI.findByIdAndUpdate(
      req.params.id,
      {
        metrics: {
          productivity: parseFloat(productivity) || 0,
          quality: parseFloat(quality) || 0,
          teamwork: parseFloat(teamwork) || 0,
          punctuality: parseFloat(punctuality) || 0,
        },
        score,
        comments,
      },
      { new: true }
    ).populate('employeeId', 'firstName lastName');

    if (!kpi) {
      return res.status(404).json({ error: 'KPI record not found' });
    }

    res.json(kpi);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete KPI
router.delete('/:id', authenticateToken, authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const kpi = await KPI.findByIdAndDelete(req.params.id);
    if (!kpi) {
      return res.status(404).json({ error: 'KPI record not found' });
    }
    res.json({ message: 'KPI record deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

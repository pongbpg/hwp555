import express from 'express';
import Salary from '../models/Salary.js';
import Employee from '../models/Employee.js';
import { authenticateToken, canViewSalary, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// Get all salary records (filtered by role)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { employeeId, month, year } = req.query;
    let query = {};

    const allowedRoles = ['owner', 'admin', 'accountant'];
    
    // If not privileged role, only show own salary
    if (!allowedRoles.includes(req.user.role)) {
      query.employeeId = req.user._id;
    } else if (employeeId) {
      query.employeeId = employeeId;
    }

    if (month) query.month = month;
    if (year) query.year = parseInt(year);

    const salaries = await Salary.find(query).populate('employeeId', 'firstName lastName email');
    res.json(salaries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get salary by employee
router.get('/employee/:id', authenticateToken, canViewSalary, async (req, res) => {
  try {
    const salaries = await Salary.find({ employeeId: req.params.id }).populate('employeeId');
    res.json(salaries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create salary record (only owner/admin/accountant)
router.post('/', authenticateToken, authorizeRoles('owner', 'admin', 'accountant'), async (req, res) => {
  try {
    const { employeeId, month, year, baseSalary, bonus, allowance, deductions, notes } = req.body;

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const grossSalary = parseFloat(baseSalary) + (parseFloat(bonus) || 0) + (parseFloat(allowance) || 0);
    const netSalary = grossSalary - (parseFloat(deductions) || 0);

    const salary = new Salary({
      employeeId,
      month,
      year,
      baseSalary: parseFloat(baseSalary),
      bonus: parseFloat(bonus) || 0,
      allowance: parseFloat(allowance) || 0,
      deductions: parseFloat(deductions) || 0,
      grossSalary,
      netSalary,
      notes,
    });

    await salary.save();
    await salary.populate('employeeId', 'firstName lastName');
    res.status(201).json(salary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update salary (only owner/admin/accountant)
router.put('/:id', authenticateToken, authorizeRoles('owner', 'admin', 'accountant'), async (req, res) => {
  try {
    const { baseSalary, bonus, allowance, deductions, status, notes } = req.body;

    const grossSalary = parseFloat(baseSalary) + (parseFloat(bonus) || 0) + (parseFloat(allowance) || 0);
    const netSalary = grossSalary - (parseFloat(deductions) || 0);

    const salary = await Salary.findByIdAndUpdate(
      req.params.id,
      {
        baseSalary: parseFloat(baseSalary),
        bonus: parseFloat(bonus) || 0,
        allowance: parseFloat(allowance) || 0,
        deductions: parseFloat(deductions) || 0,
        grossSalary,
        netSalary,
        status,
        notes,
      },
      { new: true }
    ).populate('employeeId', 'firstName lastName');

    if (!salary) {
      return res.status(404).json({ error: 'Salary record not found' });
    }

    res.json(salary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete salary (only owner/admin)
router.delete('/:id', authenticateToken, authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const salary = await Salary.findByIdAndDelete(req.params.id);
    if (!salary) {
      return res.status(404).json({ error: 'Salary record not found' });
    }
    res.json({ message: 'Salary record deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

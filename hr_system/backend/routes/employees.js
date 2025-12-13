import express from 'express';
import Employee from '../models/Employee.js';
import bcrypt from 'bcryptjs';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// Get all employees (only for admin/owner/hr)
router.get('/', authenticateToken, authorizeRoles('owner', 'admin', 'hr'), async (req, res) => {
  try {
    const employees = await Employee.find().select('-password');
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single employee (own data or admin/owner/hr)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const allowedRoles = ['owner', 'admin', 'hr'];
    
    // Check if user can view this employee
    if (!allowedRoles.includes(req.user.role) && req.params.id !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const employee = await Employee.findById(req.params.id).select('-password');
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(employee);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create employee (only admin/owner/hr)
router.post('/', authenticateToken, authorizeRoles('owner', 'admin', 'hr'), async (req, res) => {
  try {
    const { firstName, lastName, email, position, department, salary, hireDate, password, role } = req.body;

    const hashedPassword = await bcrypt.hash(password || 'password123', 10);

    const employee = new Employee({
      firstName,
      lastName,
      email,
      position,
      department,
      salary,
      hireDate: new Date(hireDate),
      password: hashedPassword,
      role: role || 'employee',
    });

    await employee.save();
    const result = employee.toObject();
    delete result.password;
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update employee
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const allowedRoles = ['owner', 'admin', 'hr'];
    const isOwnProfile = req.params.id === req.user._id.toString();
    
    // Check permissions
    if (!allowedRoles.includes(req.user.role) && !isOwnProfile) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { firstName, lastName, email, phone, position, department, salary, status, role } = req.body;
    
    const updateData = { firstName, lastName, email, phone };
    
    // Only admins can update sensitive fields
    if (allowedRoles.includes(req.user.role)) {
      if (position) updateData.position = position;
      if (department) updateData.department = department;
      if (salary !== undefined) updateData.salary = salary;
      if (status) updateData.status = status;
      if (role) updateData.role = role;
    }

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).select('-password');

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(employee);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete employee (only owner/admin)
router.delete('/:id', authenticateToken, authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Employee from '../models/Employee.js';

const router = express.Router();

// Register (optional bootstrap for stock system)
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;

    const existingEmployee = await Employee.findOne({ email });
    if (existingEmployee) {
      return res.status(400).json({ error: 'Employee already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const employee = new Employee({
      firstName: firstName || 'User',
      lastName: lastName || 'Stock',
      email,
      password: hashedPassword,
      position: 'Staff',
      department: 'General',
      salary: 0,
      hireDate: new Date(),
      role: role || 'employee',
    });

    await employee.save();
    res.status(201).json({ message: 'Employee registered successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const employee = await Employee.findOne({ email });
    if (!employee) return res.status(401).json({ error: 'Invalid credentials' });

    const isPasswordValid = await bcrypt.compare(password, employee.password);
    if (!isPasswordValid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: employee._id, email: employee.email, role: employee.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      employee: {
        id: employee._id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        role: employee.role,
        position: employee.position,
        department: employee.department,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

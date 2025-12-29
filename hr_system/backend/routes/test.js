import express from 'express';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import KPI from '../models/KPI.js';
import Salary from '../models/Salary.js';

const router = express.Router();

// ===== HEALTH CHECK =====
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Test API is working',
    timestamp: new Date().toISOString(),
  });
});

// ===== EMPLOYEES TEST ROUTES =====

// GET all employees (ทดสอบ)
router.get('/employees', async (req, res) => {
  try {
    const employees = await Employee.find().limit(10);
    res.json({
      success: true,
      count: employees.length,
      data: employees,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single employee by ID
router.get('/employees/:id', async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json({
      success: true,
      data: employee,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Create dummy employee (ทดสอบ)
router.post('/employees/dummy', async (req, res) => {
  try {
    const dummyEmployee = new Employee({
      firstName: 'Test',
      lastName: 'User',
      email: `test-${Date.now()}@example.com`,
      phone: '0812345678',
      position: 'Developer',
      department: 'IT',
      hireDate: new Date(),
      salary: 50000,
    });

    await dummyEmployee.save();
    res.status(201).json({
      success: true,
      message: 'Dummy employee created',
      data: dummyEmployee,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE - Clear all dummy test employees
router.delete('/employees/clear-dummy', async (req, res) => {
  try {
    const result = await Employee.deleteMany({
      email: { $regex: 'test-' },
    });
    res.json({
      success: true,
      message: 'Dummy employees deleted',
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== ATTENDANCE TEST ROUTES =====

// GET attendance records
router.get('/attendance', async (req, res) => {
  try {
    const attendance = await Attendance.find().limit(10).populate('employeeId', 'firstName lastName');
    res.json({
      success: true,
      count: attendance.length,
      data: attendance,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Create dummy attendance
router.post('/attendance/dummy/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;

    // ตรวจสอบว่าพนักงานมีอยู่ไหม
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const dummyAttendance = new Attendance({
      employeeId,
      date: new Date(),
      checkInTime: new Date(new Date().setHours(9, 0, 0)),
      checkOutTime: new Date(new Date().setHours(17, 30, 0)),
      status: 'present',
    });

    await dummyAttendance.save();
    res.status(201).json({
      success: true,
      message: 'Dummy attendance created',
      data: dummyAttendance,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== KPI TEST ROUTES =====

// GET KPI records
router.get('/kpi', async (req, res) => {
  try {
    const kpis = await KPI.find().limit(10).populate('employeeId', 'firstName lastName');
    res.json({
      success: true,
      count: kpis.length,
      data: kpis,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Create dummy KPI
router.post('/kpi/dummy/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const dummyKPI = new KPI({
      employeeId,
      period: `${new Date().getFullYear()}-Q1`,
      metrics: {
        productivity: 85,
        quality: 90,
        teamwork: 88,
      },
      overallScore: 87.67,
      feedback: 'Good performance',
      evaluationDate: new Date(),
    });

    await dummyKPI.save();
    res.status(201).json({
      success: true,
      message: 'Dummy KPI created',
      data: dummyKPI,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== SALARY TEST ROUTES =====

// GET salary records
router.get('/salary', async (req, res) => {
  try {
    const salaries = await Salary.find().limit(10).populate('employeeId', 'firstName lastName');
    res.json({
      success: true,
      count: salaries.length,
      data: salaries,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Create dummy salary
router.post('/salary/dummy/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const dummySalary = new Salary({
      employeeId,
      baseSalary: 50000,
      allowances: {
        transportation: 2000,
        meals: 1000,
      },
      deductions: {
        tax: 5000,
        insurance: 2500,
      },
      netSalary: 45500,
      paymentDate: new Date(),
      status: 'paid',
    });

    await dummySalary.save();
    res.status(201).json({
      success: true,
      message: 'Dummy salary created',
      data: dummySalary,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== DATABASE STATUS =====

// GET database connection status
router.get('/db-status', async (req, res) => {
  try {
    const employeeCount = await Employee.countDocuments();
    const attendanceCount = await Attendance.countDocuments();
    const kpiCount = await KPI.countDocuments();
    const salaryCount = await Salary.countDocuments();

    res.json({
      status: 'connected',
      collections: {
        employees: employeeCount,
        attendance: attendanceCount,
        kpi: kpiCount,
        salary: salaryCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
    });
  }
});

export default router;

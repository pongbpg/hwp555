import express from 'express';
import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';

const router = express.Router();

// Get all attendance records
router.get('/', async (req, res) => {
  try {
    const { employeeId, month, year } = req.query;
    let query = {};

    if (employeeId) query.employeeId = employeeId;
    if (month && year) {
      const startDate = new Date(year, parseInt(month) - 1, 1);
      const endDate = new Date(year, parseInt(month), 0);
      query.date = { $gte: startDate, $lte: endDate };
    }

    const attendance = await Attendance.find(query).populate('employeeId', 'firstName lastName');
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get attendance by employee
router.get('/employee/:id', async (req, res) => {
  try {
    const attendance = await Attendance.find({ employeeId: req.params.id }).populate('employeeId');
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create attendance record
router.post('/', async (req, res) => {
  try {
    const { employeeId, date, status, checkInTime, checkOutTime, leaveType, notes } = req.body;

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const attendance = new Attendance({
      employeeId,
      date: new Date(date),
      status,
      checkInTime,
      checkOutTime,
      leaveType: status === 'leave' ? leaveType : undefined,
      notes,
    });

    await attendance.save();
    await attendance.populate('employeeId', 'firstName lastName');
    res.status(201).json(attendance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update attendance
router.put('/:id', async (req, res) => {
  try {
    const { status, checkInTime, checkOutTime, leaveType, notes } = req.body;

    const attendance = await Attendance.findByIdAndUpdate(
      req.params.id,
      { status, checkInTime, checkOutTime, leaveType, notes },
      { new: true }
    ).populate('employeeId', 'firstName lastName');

    if (!attendance) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    res.json(attendance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete attendance
router.delete('/:id', async (req, res) => {
  try {
    const attendance = await Attendance.findByIdAndDelete(req.params.id);
    if (!attendance) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    res.json({ message: 'Attendance record deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

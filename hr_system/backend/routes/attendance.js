import express from 'express';
import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Leave quota per year (can be configured per company)
const LEAVE_QUOTA = {
  annual: 10,    // พักร้อน 10 วัน
  sick: 30,      // ลาป่วย 30 วัน
  personal: 5,   // ลากิจ 5 วัน
};

// Get leave summary for an employee for a specific year
const getLeavesSummary = async (employeeId, year) => {
  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year, 11, 31, 23, 59, 59);
  
  const leaves = await Attendance.find({
    employeeId,
    date: { $gte: startOfYear, $lte: endOfYear },
    status: 'approved',
  });

  const summary = {
    annual: { used: 0, quota: LEAVE_QUOTA.annual },
    sick: { used: 0, quota: LEAVE_QUOTA.sick },
    personal: { used: 0, quota: LEAVE_QUOTA.personal },
  };

  leaves.forEach(leave => {
    const days = leave.isHalfDay ? 0.5 : (leave.endDate ? 
      Math.ceil((new Date(leave.endDate) - new Date(leave.date)) / (1000 * 60 * 60 * 24)) + 1 : 1);
    if (summary[leave.leaveType]) {
      summary[leave.leaveType].used += days;
    }
  });

  return summary;
};

// Get all leave records
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { employeeId, year, status } = req.query;
    let query = {};

    // Only HR and Owner can see all employees' leaves
    const canViewAll = ['owner', 'hr'].includes(req.user.role);
    if (!canViewAll) {
      query.employeeId = req.user._id;
    } else if (employeeId) {
      query.employeeId = employeeId;
    }

    if (year) {
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year, 11, 31, 23, 59, 59);
      query.date = { $gte: startOfYear, $lte: endOfYear };
    }

    if (status) {
      query.status = status;
    }

    const leaves = await Attendance.find(query)
      .populate('employeeId', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName')
      .sort({ date: -1 });
    res.json(leaves);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get leave summary for dashboard
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const canViewAll = ['owner', 'hr'].includes(req.user.role);

    if (!canViewAll) {
      // Regular employees can only see their own summary
      const summary = await getLeavesSummary(req.user._id, year);
      return res.json({ personal: summary });
    }

    // HR/Owner can see all employees' summary
    const employees = await Employee.find({ status: 'active' }).select('firstName lastName');
    const summaries = [];

    for (const emp of employees) {
      const summary = await getLeavesSummary(emp._id, year);
      const totalUsed = summary.annual.used + summary.sick.used + summary.personal.used;
      const totalQuota = summary.annual.quota + summary.sick.quota + summary.personal.quota;
      
      summaries.push({
        employee: { _id: emp._id, firstName: emp.firstName, lastName: emp.lastName },
        ...summary,
        totalUsed,
        totalQuota,
        usagePercent: totalQuota > 0 ? ((totalUsed / totalQuota) * 100).toFixed(1) : 0,
      });
    }

    // Sort by total usage (descending)
    summaries.sort((a, b) => b.totalUsed - a.totalUsed);

    res.json({ 
      summaries, 
      year,
      leaveQuota: LEAVE_QUOTA,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get my leave balance
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const summary = await getLeavesSummary(req.user._id, year);
    
    res.json({
      year,
      ...summary,
      remaining: {
        annual: summary.annual.quota - summary.annual.used,
        sick: summary.sick.quota - summary.sick.used,
        personal: summary.personal.quota - summary.personal.used,
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get leaves by employee
router.get('/employee/:id', authenticateToken, async (req, res) => {
  try {
    const canViewAll = ['owner', 'hr'].includes(req.user.role);
    if (!canViewAll && req.params.id !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const leaves = await Attendance.find({ employeeId: req.params.id })
      .populate('employeeId')
      .populate('approvedBy', 'firstName lastName')
      .sort({ date: -1 });
    res.json(leaves);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create leave request
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { employeeId, date, endDate, leaveType, isHalfDay, halfDayPeriod, reason } = req.body;

    const canManageAll = ['owner', 'hr'].includes(req.user.role);
    const targetEmployeeId = canManageAll ? employeeId : req.user._id.toString();

    if (!canManageAll && employeeId !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const employee = await Employee.findById(targetEmployeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Validate half-day is only for sick and personal leave
    if (isHalfDay && !['sick', 'personal'].includes(leaveType)) {
      return res.status(400).json({ error: 'Half-day leave is only available for sick and personal leave.' });
    }

    // Check leave balance
    const year = new Date(date).getFullYear();
    const summary = await getLeavesSummary(targetEmployeeId, year);
    const requestedDays = isHalfDay ? 0.5 : (endDate ? 
      Math.ceil((new Date(endDate) - new Date(date)) / (1000 * 60 * 60 * 24)) + 1 : 1);

    if (summary[leaveType].used + requestedDays > summary[leaveType].quota) {
      return res.status(400).json({ 
        error: `Insufficient ${leaveType} leave balance. Remaining: ${summary[leaveType].quota - summary[leaveType].used} days` 
      });
    }

    const leave = new Attendance({
      employeeId: targetEmployeeId,
      date: new Date(date),
      endDate: endDate ? new Date(endDate) : undefined,
      leaveType,
      isHalfDay: isHalfDay || false,
      halfDayPeriod: isHalfDay ? halfDayPeriod : undefined,
      reason,
      status: canManageAll ? 'approved' : 'pending',
      approvedBy: canManageAll ? req.user._id : undefined,
      approvedAt: canManageAll ? new Date() : undefined,
    });

    await leave.save();
    await leave.populate('employeeId', 'firstName lastName');
    res.status(201).json(leave);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve/Reject leave request (HR/Owner only)
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const canManageAll = ['owner', 'hr'].includes(req.user.role);
    if (!canManageAll) {
      return res.status(403).json({ error: 'Access denied. Only HR and Owner can approve/reject leave.' });
    }

    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const leave = await Attendance.findByIdAndUpdate(
      req.params.id,
      { 
        status, 
        approvedBy: req.user._id,
        approvedAt: new Date(),
      },
      { new: true }
    ).populate('employeeId', 'firstName lastName')
     .populate('approvedBy', 'firstName lastName');

    if (!leave) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    res.json(leave);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update leave request (only pending ones, by owner or HR)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const existingLeave = await Attendance.findById(req.params.id);
    if (!existingLeave) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    const canManageAll = ['owner', 'hr'].includes(req.user.role);
    const isOwnLeave = existingLeave.employeeId.toString() === req.user._id.toString();

    if (!canManageAll && !isOwnLeave) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Regular employees can only update pending requests
    if (!canManageAll && existingLeave.status !== 'pending') {
      return res.status(403).json({ error: 'Cannot modify approved/rejected leave.' });
    }

    const { date, endDate, leaveType, isHalfDay, halfDayPeriod, reason } = req.body;

    const leave = await Attendance.findByIdAndUpdate(
      req.params.id,
      { 
        date: date ? new Date(date) : existingLeave.date,
        endDate: endDate ? new Date(endDate) : undefined,
        leaveType: leaveType || existingLeave.leaveType,
        isHalfDay: isHalfDay || false,
        halfDayPeriod: isHalfDay ? halfDayPeriod : undefined,
        reason: reason || existingLeave.reason,
      },
      { new: true }
    ).populate('employeeId', 'firstName lastName');

    res.json(leave);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete leave request
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const existingLeave = await Attendance.findById(req.params.id);
    if (!existingLeave) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    const canManageAll = ['owner', 'hr'].includes(req.user.role);
    const isOwnLeave = existingLeave.employeeId.toString() === req.user._id.toString();

    if (!canManageAll && !isOwnLeave) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Regular employees can only delete pending requests
    if (!canManageAll && existingLeave.status !== 'pending') {
      return res.status(403).json({ error: 'Cannot delete approved/rejected leave.' });
    }

    await Attendance.findByIdAndDelete(req.params.id);
    res.json({ message: 'Leave request deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

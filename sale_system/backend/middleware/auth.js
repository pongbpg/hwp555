import jwt from 'jsonwebtoken';
import Employee from '../../../hr_system/backend/models/Employee.js';

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const employee = await Employee.findById(decoded.id).select('-password');
    if (!employee) return res.status(401).json({ error: 'Invalid token' });

    req.user = employee;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

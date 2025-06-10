const jwt = require('jsonwebtoken');
const Admin = require('../model/AdminModel');
const User = require('../model/userModel');

// This middleware handles both user and admin authentication
const authenticateToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ success: false, message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your_jwt_secret");
    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};

// This middleware only allows admin access
const authenticateAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    if (!decoded.isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized as admin' });
    }
    
    const admin = await Admin.findById(decoded.userId);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
    
    req.admin = admin;
    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

// This middleware only allows regular users (not admins)
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    // Allow admins to access user routes as well (more permissive)
    if (decoded.isAdmin) {
      const admin = await Admin.findById(decoded.userId);
      if (!admin) {
        return res.status(404).json({ success: false, message: 'Admin not found' });
      }
      req.admin = admin;
      req.user = { _id: decoded.userId, isAdmin: true }; // Add basic user info
      return next();
    }
    
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: 'Your account has been blocked' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('User authentication error:', error);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

module.exports = { authenticateToken, authenticateAdmin, authenticateUser };
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

// Auth middleware for any logged-in user (user or admin)
export const isAuth = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({
        message: "Unauthorized access",
        success: false,
      });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded) {
      return res.status(401).json({
        message: "Invalid token",
        success: false,
      });
    }
    req.id = decoded.userId;
    req.user = await User.findById(decoded.userId).select("-password");
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(401).json({
      message: "Authentication failed",
      success: false,
    });
  }
};

// Middleware for admin-only routes
export const isAdmin = async (req, res, next) => {
  // isAuth should run before this!
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      message: "Admin access denied",
      success: false,
    });
  }
  next();
};

// Middleware for user-only routes (optional, if you want to restrict some routes to non-admins)
export const isUser = async (req, res, next) => {
  if (!req.user || req.user.role !== "user") {
    return res.status(403).json({
      message: "User access denied",
      success: false,
    });
  }
  next();
};

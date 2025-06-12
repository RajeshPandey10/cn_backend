import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";

// Admin login (cookie-based)
export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await User.findOne({ email, role: "admin" });
    if (!admin) {
      return res
        .status(404)
        .json({ success: false, message: "Admin not found" });
    }
    const isValidPassword = await bcrypt.compare(password, admin.password);
    if (!isValidPassword) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid password" });
    }
    const token = jwt.sign(
      { userId: admin._id, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    const adminData = {
      _id: admin._id,
      username: admin.username,
      email: admin.email,
      role: admin.role,
      phone: admin.phone,
    };
    return res
      .cookie("token", token, {
        httpOnly: true,
        sameSite: "strict",
        maxAge: 1 * 24 * 60 * 60 * 1000,
      })
      .json({
        message: `Welcome back ${admin.username}`,
        success: true,
        admin: adminData,
      });
  } catch (error) {
    console.error("Admin signin error:", error);
    res.status(500).json({ success: false, message: "Error during signin" });
  }
};

// Admin logout
export const logoutAdmin = async (req, res) => {
  try {
    return res.cookie("token", "", { maxAge: 0 }).json({
      message: "Successfully logged out",
      success: true,
    });
  } catch (error) {
    console.error("Error during logout:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("user", "username email")
      .populate("items.product", "name price image")
      .sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (error) {
    console.error("Error fetching all orders:", error);
    res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
};

export const getNewOrdersCount = async (req, res) => {
  try {
    const { since } = req.query;
    if (!since) {
      return res
        .status(400)
        .json({ success: false, message: "Missing timestamp parameter" });
    }
    const newOrdersCount = await Order.countDocuments({
      createdAt: { $gt: new Date(since) },
    });
    res.json({ success: true, count: newOrdersCount });
  } catch (error) {
    console.error("Error checking for new orders:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to check for new orders" });
  }
};

export const getPendingOrdersCount = async (req, res) => {
  try {
    const count = await Order.countDocuments({ status: "pending" });
    res.json({ success: true, count });
  } catch (error) {
    console.error("Error getting pending orders count:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to get pending orders count" });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const totalProducts = await Product.countDocuments();
    const outOfStock = await Product.countDocuments({ stock: 0 });
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: "pending" });
    const totalRevenueArr = await Order.aggregate([
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]);
    const totalRevenue = totalRevenueArr[0]?.total || 0;
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("user", "username email");

    res.json({
      success: true,
      data: {
        users: { total: totalUsers, active: activeUsers },
        products: { total: totalProducts, outOfStock },
        orders: { total: totalOrders, pending: pendingOrders, totalRevenue },
        recentOrders,
      },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching dashboard statistics" });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    if (!["pending", "processing", "delivered", "cancelled"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status value" });
    }
    const order = await Order.findByIdAndUpdate(
      orderId,
      { status },
      { new: true }
    );
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    res.json({
      success: true,
      message: "Order status updated successfully",
      order,
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res
      .status(500)
      .json({ success: false, message: "Error updating order status" });
  }
};

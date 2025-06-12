import express from "express";
import {
  
  loginAdmin,
  getAllOrders,
  getNewOrdersCount,
  getPendingOrdersCount,
  getDashboardStats,
  updateOrderStatus,
  
} from "../controllers/admin.controller.js";
import {isAdmin} from "../middlewares/isAuth.js";

const router = express.Router();

router.post("/login", loginAdmin);
router.get("/orders", isAdmin, getAllOrders);
router.get("/orders/new", isAdmin, getNewOrdersCount);
router.get("/orders/pending-count", isAdmin, getPendingOrdersCount);
router.get("/dashboard-stats", isAdmin, getDashboardStats);
router.put("/orders/:orderId", isAdmin, updateOrderStatus);

export default router;

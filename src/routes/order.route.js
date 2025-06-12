import express from "express";
import {
  createOrder,
  getAllOrders,
  getUserOrders,
  updateOrderStatus,
  getOrderById,
  deleteOrder,
  updateProductStock,
  cancelOrder,
} from "../controllers/order.controller.js";
import {isAuth} from "../middlewares/isAuth.js";
import {isAdmin} from "../middlewares/isAuth.js";

const router = express.Router();

router.post("/", isAuth, createOrder);
router.get("/all", isAdmin, getAllOrders);
router.get("/my-orders", isAuth, getUserOrders);
router.patch("/:orderId/status", isAdmin, updateOrderStatus);
router.get("/:id", isAuth, getOrderById);
router.delete("/:id", isAdmin, deleteOrder);
router.put("/product/:id/stock", isAdmin, updateProductStock);
router.put("/:orderId/cancel", isAuth, cancelOrder);

export default router;

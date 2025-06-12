import express from "express";
import {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
} from "../controllers/cart.controller.js";
import {isAuth} from "../middlewares/isAuth.js";

const router = express.Router();

router.get("/", isAuth, getCart);
router.post("/add", isAuth, addToCart);
router.put("/update", isAuth, updateCartItem);
router.delete("/remove/:productId", isAuth, removeCartItem);
router.delete("/clear", isAuth, clearCart);

export default router;

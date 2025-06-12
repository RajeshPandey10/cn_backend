import express from "express";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
} from "../controllers/wishlist.controller.js";
import {isAuth} from "../middlewares/isAuth.js";

const router = express.Router();

router.get("/", isAuth, getWishlist);
router.post("/add", isAuth, addToWishlist);
router.delete("/remove/:productId", isAuth, removeFromWishlist);
router.delete("/clear", isAuth, clearWishlist);

export default router;

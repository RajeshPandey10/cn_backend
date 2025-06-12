import express from "express";
import { isAuth, isAdmin } from "../middlewares/isAuth.js";
import {
  addProduct,
  updateProduct,
  deleteProduct,
  getAllProducts,
  getProductById,
} from "../controllers/product.controller.js";
import upload from "../middlewares/multer.js";

const router = express.Router();

// Public: Get all products and get product by id
router.get("/", getAllProducts);
router.get("/:id", getProductById);

// Admin only: Add, update, delete products
router.post("/", isAuth, isAdmin, upload.single("image"), addProduct);
router.patch("/:id", isAuth, isAdmin, upload.single("image"), updateProduct);
router.delete("/:id", isAuth, isAdmin, deleteProduct);

export default router;

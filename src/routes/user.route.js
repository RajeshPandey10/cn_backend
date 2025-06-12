import express from "express";
import {
  register,
  login,
  logout,
  getProfile,
  editProfile,
  getAllUsers,
} from "../controllers/user.controller.js";
import { isAuth, isAdmin } from "../middlewares/isAuth.js";
import upload from "../middlewares/multer.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/logout", logout);
router.patch("/profile/edit", isAuth, upload.single("profilePicture"), editProfile);
router.get("/profile/:id", isAuth, getProfile);
router.get("/all", isAuth, isAdmin, getAllUsers);

export default router;

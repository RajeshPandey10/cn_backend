import express from "express";
import {
  register,
  login,
  logout,
  getProfile,
  editProfile,
} from "../controllers/user.controller.js";
import {isAuth} from "../middlewares/isAuth.js";
import upload from "../middlewares/multer.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/logout", logout);
router.get("/:id/profile", isAuth, getProfile);
router.post(
  "/profile/edit",
  isAuth,
  upload.single("profilePicture"),
  editProfile
);

export default router;

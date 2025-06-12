import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import User from "../src/models/user.model.js";

dotenv.config();

const MONGODB_URL = process.env.MONGODB_URL;

const seedAdmin = async () => {
  try {
    await mongoose.connect(MONGODB_URL);
    console.log("Connected to MongoDB");

    const adminEmail = "admin@cnmart.com";
    const adminPassword = "admin123"; // Change this in production!
    const existingAdmin = await User.findOne({
      email: adminEmail,
      role: "admin",
    });
    if (existingAdmin) {
      console.log("Admin already exists.");
      process.exit(0);
    }
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const admin = new User({
      username: "admin",
      email: adminEmail,
      password: hashedPassword,
      phone: "9800000000",
      role: "admin",
    });
    await admin.save();
    console.log("Admin user seeded successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding admin:", error);
    process.exit(1);
  }
};

seedAdmin();

import dotenv from "dotenv";
dotenv.config();

import connectDB from "../database/db.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";


const seedAdmin = async () => {
  try {
    await connectDB();

    const adminEmail = "admin@gmail.com";
    const adminPassword = "admin123";
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
      name: "Admin",
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

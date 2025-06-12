import express, { urlencoded } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./database/db.js";
import userRoute from "./routes/user.route.js";
import adminRoute from "./routes/admin.route.js";
import productRoute from "./routes/product.route.js";
import orderRoute from "./routes/order.route.js";
import cartRoute from "./routes/cart.route.js";
import wishlistRoute from "./routes/wishlist.route.js";

dotenv.config({});

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(urlencoded({ extended: true }));

const corsOptions = {
  origin: "http://localhost:5173",
  credentials: true,
};
app.use(cors(corsOptions));

const PORT = process.env.PORT || 3000;

// Routes
app.use("/api/v1/user", userRoute);
app.use("/api/v1/admin", adminRoute);
app.use("/api/v1/products", productRoute);
app.use("/api/v1/order", orderRoute);
app.use("/api/v1/cart", cartRoute);
app.use("/api/v1/wishlist", wishlistRoute);

app.get("/", (req, res) => {
  return res.status(200).json({
    message: "i am comming from backend",
  });
});

app.listen(PORT, () => {
  connectDB();
  console.log(`Server is running on port ${PORT}`);
});

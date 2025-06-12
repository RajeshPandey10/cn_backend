import Wishlist from "../models/wishlist.model.js";
import Product from "../models/product.model.js";

// Get wishlist for the logged-in user
export const getWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const wishlistItems = await Wishlist.find({ user: userId }).populate(
      "product"
    );
    const validItems = wishlistItems.filter((item) => item.product);
    res.json({
      success: true,
      wishlist: {
        products: validItems.map((item) => item.product),
      },
    });
  } catch (error) {
    console.error("Error fetching wishlist:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch wishlist" });
  }
};

// Add product to wishlist
export const addToWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.body;
    if (!productId) {
      return res
        .status(400)
        .json({ success: false, message: "Product ID is required" });
    }
    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }
    const existingItem = await Wishlist.findOne({
      user: userId,
      product: productId,
    });
    if (existingItem) {
      return res
        .status(200)
        .json({ success: true, message: "Product already in wishlist" });
    }
    const wishlistItem = new Wishlist({ user: userId, product: productId });
    await wishlistItem.save();
    const updatedWishlist = await Wishlist.find({ user: userId }).populate(
      "product"
    );
    const validItems = updatedWishlist.filter((item) => item.product);
    res.status(201).json({
      success: true,
      message: "Product added to wishlist",
      wishlist: { products: validItems.map((item) => item.product) },
    });
  } catch (error) {
    console.error("Error adding to wishlist:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to add to wishlist" });
  }
};

// Remove product from wishlist
export const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;
    await Wishlist.findOneAndDelete({ user: userId, product: productId });
    const updatedWishlist = await Wishlist.find({ user: userId }).populate(
      "product"
    );
    const validItems = updatedWishlist.filter((item) => item.product);
    res.json({
      success: true,
      message: "Product removed from wishlist",
      wishlist: { products: validItems.map((item) => item.product) },
    });
  } catch (error) {
    console.error("Error removing from wishlist:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to remove from wishlist" });
  }
};

// Clear entire wishlist
export const clearWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    await Wishlist.deleteMany({ user: userId });
    res.json({
      success: true,
      message: "Wishlist cleared",
      wishlist: { products: [] },
    });
  } catch (error) {
    console.error("Error clearing wishlist:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to clear wishlist" });
  }
};

const express = require("express");
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticateAdmin, authenticateToken } = require('../middleware/auth');
const Product = require("../model/productModel");
const Order = require("../model/orderModel");
const Review = require("../model/reviewModel");
const fs = require('fs');

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Save in uploads directory
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Helper function to format product with full image URL
const formatProductWithImage = (product) => {
  if (!product) return null;
  
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';
  const productObj = product.toObject ? product.toObject() : product;
  
  // Ensure image path is properly formatted
  let imagePath = null;
  if (productObj.image) {
    // Remove any duplicate 'uploads/' in the path
    const cleanImage = productObj.image.replace(/^uploads\//, '');
    imagePath = `${baseURL}/uploads/${cleanImage}`;
  }
  
  return {
    ...productObj,
    image: imagePath || null
  };
};

// Move these special routes BEFORE the :id route
// Get categories
router.get('/category', async (req, res) => {
  try {
    const categories = await Product.distinct('category');
    res.json({
      success: true,
      categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
});

// Search and filter products
router.get('/search', async (req, res) => {
  try {
    const { category, sort, search } = req.query;
    let query = {};
    let sortOption = {};

    // Category filter
    if (category && category !== 'all') {
      query.category = category;
    }

    // Search filter
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    // Sort options
    switch (sort) {
      case 'price-high':
        sortOption = { price: -1 };
        break;
      case 'price-low':
        sortOption = { price: 1 };
        break;
      case 'newest':
        sortOption = { createdAt: -1 };
        break;
      case 'popular':
        sortOption = { rating: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const products = await Product.find(query)
      .sort(sortOption)
      .lean();

    const formattedProducts = products.map(formatProductWithImage);

    res.json({
      success: true,
      products: formattedProducts
    });
  } catch (error) {
    console.error('Error fetching filtered products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products'
    });
  }
});

// Get all products
router.get('/all', async (req, res) => {
  try {
    const products = await Product.find()
      .sort({ createdAt: -1 })
      .lean();

    const formattedProducts = products.map(formatProductWithImage);

    res.json({
      success: true,
      products: formattedProducts
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products'
    });
  }
});

// AFTER all other routes, put the :id route
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate({
        path: 'reviews',
        populate: {
          path: 'user',
          select: 'name'
        }
      });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const formattedProduct = formatProductWithImage(product);

    res.json({
      success: true,
      product: formattedProduct
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product'
    });
  }
});

// Get all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find()
      .select('name price description image stock rating totalReviews')
      .lean();

    const productsWithReviews = await Promise.all(
      products.map(async (product) => {
        const reviewCount = await Review.countDocuments({ product: product._id });
        return {
          ...product,
          totalReviews: reviewCount
        };
      })
    );

    res.json({
      success: true,
      products: productsWithReviews
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products'
    });
  }
});

// Create product
router.post('/create', authenticateAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, category, stock, unit } = req.body;
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an image'
      });
    }

    // Preserve description exactly as submitted without trimming
    const product = await Product.create({
      name,
      description: description || "", // Keep the exact formatting
      price: Number(price),
      category,
      stock: Number(stock),
      unit,
      image: req.file.filename
    });

    const formattedProduct = formatProductWithImage(product);

    res.status(201).json({
      success: true,
      product: formattedProduct
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product'
    });
  }
});

// Update product
router.put('/:id', authenticateAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, category, stock, unit } = req.body;
    const updateData = {
      name,
      description: description || "", // Preserve formatting
      price: Number(price),
      category,
      stock: Number(stock),
      unit
    };

    if (req.file) {
      updateData.image = req.file.filename;
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      product
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product'
    });
  }
});

// Delete product
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product'
    });
  }
});

// Add review to product
router.post('/:id/review', authenticateToken, async (req, res) => {
  try {
    const { rating, comment, orderId } = req.body;
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user has a delivered order containing this product
    const deliveredOrder = await Order.findOne({
      _id: orderId,
      user: req.user._id,
      'items.product': product._id,
      status: 'delivered'
    });

    if (!deliveredOrder) {
      return res.status(403).json({
        success: false,
        message: 'You can only review products from delivered orders'
      });
    }

    // Check if user already reviewed this product for this order
    const existingReview = product.reviews.find(
      r => r.user.toString() === req.user._id.toString() && 
           r.order.toString() === orderId
    );

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this product for this order'
      });
    }

    // Add the review
    const review = {
      user: req.user._id,
      order: orderId,
      rating: Number(rating),
      comment,
      name: req.user.name // Add user's name for display
    };

    product.reviews.push(review);

    // Update product rating
    const totalRating = product.reviews.reduce((acc, item) => item.rating + acc, 0);
    product.rating = totalRating / product.reviews.length;
    product.numReviews = product.reviews.length;

    await product.save();

    // Return the formatted review
    res.status(201).json({
      success: true,
      message: 'Review added successfully',
      review: {
        ...review,
        createdAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error adding review:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding review'
    });
  }
});

module.exports = router;

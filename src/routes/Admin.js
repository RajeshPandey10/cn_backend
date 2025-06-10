// admin.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Admin = require('../model/AdminModel');
const router = express.Router();
const Order = require('../model/orderModel');
const User = require('../model/userModel');
const Product = require('../model/productModel');
const { authenticateAdmin } = require('../middleware/auth');
const Review = require('../model/reviewModel');
const fs = require('fs');
const path = require('path');

// Create a new admin
router.post('/create', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Admin already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = new Admin({ 
      name,
      email, 
      password: hashedPassword,
      isAdmin: true
    });
    
    await newAdmin.save();
    res.status(201).json({ message: 'Admin created successfully' });
  } catch (error) {
    console.error('Admin creation error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Admin signin
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find admin by email
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, admin.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: admin._id, isAdmin: true }, // Include `isAdmin` in the payload
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '24h' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      admin: { id: admin._id, name: admin.name, email: admin.email }
    });
  } catch (error) {
    console.error('Admin signin error:', error);
    res.status(500).json({ success: false, message: 'Error during signin' });
  }
});

// Modify clear delivered orders to not affect revenue tracking
router.delete('/orders/clear-delivered', authenticateAdmin, async (req, res) => {
  try {
    const result = await Order.deleteMany({ status: 'delivered' });
    
    res.json({
      success: true,
      message: `Cleared ${result.deletedCount} delivered orders`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error clearing delivered orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error clearing delivered orders'
    });
  }
});

// Get all orders for admin
router.get('/orders', authenticateAdmin, async (req, res) => {
  try {
    const baseURL = process.env.BASE_URL || 'http://localhost:3000';
    const orders = await Order.find()
      .populate({
        path: 'items.product',
        select: 'name price image'
      })
      .populate({
        path: 'user',
        select: 'name email phone'  // Make sure we're selecting phone field as well
      })
      .sort({ createdAt: -1 });

    // Format orders with full image URLs and handle missing products
    const formattedOrders = orders.map(order => {
      const formattedItems = order.items.map(item => {
        // Handle case where product might be null
        if (!item.product) {
          return {
            ...item.toObject(),
            product: {
              name: 'Product Unavailable',
              price: 0,
              image: `${baseURL}/uploads/placeholder.jpg`
            }
          };
        }

        // Handle case where product exists but image might be missing
        const imagePath = item.product.image;
        let imageUrl = `${baseURL}/uploads/placeholder.jpg`; // Default image

        if (imagePath) {
          // Get just the filename
          const filename = imagePath.split('/').pop();
          // Check if file exists
          const fullPath = path.join(__dirname, '../../uploads/', filename);
          
          if (fs.existsSync(fullPath)) {
            imageUrl = `${baseURL}/uploads/${filename}`;
          } else {
            console.log(`Image not found: ${fullPath}`);
          }
        }

        return {
          ...item.toObject(),
          product: {
            ...item.product.toObject(),
            image: imageUrl
          }
        };
      });

      return {
        ...order.toObject(),
        items: formattedItems
      };
    });

    res.json({
      success: true,
      orders: formattedOrders
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
});

// Add this new route to check for new orders since a timestamp
router.get('/orders/new', authenticateAdmin, async (req, res) => {
  try {
    const { since } = req.query;
    
    if (!since) {
      return res.status(400).json({
        success: false,
        message: 'Missing timestamp parameter'
      });
    }
    
    // Find orders created after the provided timestamp
    const newOrdersCount = await Order.countDocuments({
      createdAt: { $gt: new Date(since) }
    });
    
    res.json({
      success: true,
      count: newOrdersCount
    });
  } catch (error) {
    console.error('Error checking for new orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check for new orders'
    });
  }
});

// Add a new route to get pending orders count
router.get('/orders/pending-count', authenticateAdmin, async (req, res) => {
  try {
    const count = await Order.countDocuments({ status: 'pending' });
    
    res.json({
      success: true,
      count
    });
  } catch (error) {
    console.error('Error getting pending orders count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pending orders count'
    });
  }
});

// Get dashboard stats
router.get('/dashboard-stats', authenticateAdmin, async (req, res) => {
  try {
    // Get total users and active users
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });

    // Get product stats
    const totalProducts = await Product.countDocuments();
    const outOfStock = await Product.countDocuments({ countInStock: 0 });

    // Get order stats
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    
    // Get total revenue (including delivered orders)
    const totalRevenue = await Order.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: '$total' }
        }
      }
    ]);

    // Get recent orders
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'name email');

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers
        },
        products: {
          total: totalProducts,
          outOfStock
        },
        orders: {
          total: totalOrders,
          pending: pendingOrders,
          totalRevenue: totalRevenue[0]?.total || 0
        },
        recentOrders
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics'
    });
  }
});

// Add this route to update order status
router.put('/orders/:orderId', authenticateAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!['pending', 'processing', 'delivered', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const order = await Order.findByIdAndUpdate(
      orderId,
      { status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating order status'
    });
  }
});

// Get all reviews
router.get('/reviews', authenticateAdmin, async (req, res) => {
  try {
    const reviews = await Review.find()
      .populate('user', 'name email')
      .populate('product', 'name')
      .sort({ createdAt: -1 });

    // Format reviews with full image URLs
    const formattedReviews = reviews.map(review => {
      const reviewObj = review.toObject();
      if (reviewObj.image) {
        reviewObj.image = `${process.env.BASE_URL || 'http://localhost:3000'}${reviewObj.image}`;
      }
      return reviewObj;
    });

    res.json({
      success: true,
      reviews: formattedReviews
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
});

// Toggle review visibility
router.patch('/reviews/:reviewId/visibility', authenticateAdmin, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { visible } = req.body;

    const review = await Review.findByIdAndUpdate(
      reviewId,
      { visible },
      { new: true }
    );

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    res.json({
      success: true,
      message: `Review ${visible ? 'shown' : 'hidden'} successfully`,
      review
    });
  } catch (error) {
    console.error('Error updating review visibility:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update review visibility'
    });
  }
});

// Delete review
router.delete('/reviews/:reviewId', authenticateAdmin, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const review = await Review.findByIdAndDelete(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    res.json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete review'
    });
  }
});

// Delete single order
router.delete('/orders/:orderId', authenticateAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByIdAndDelete(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      message: 'Order deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete order'
    });
  }
});

module.exports = router;


const express = require("express");
const router = express.Router();
const jwt = require('jsonwebtoken');
const Order = require("../model/orderModel");
const Product = require("../model/productModel");

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    req.user = { _id: decoded.userId };
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// Create a new order
router.post('/new', authenticateToken, async (req, res) => {
  try {
    const { items, total, shippingAddress, phone, city, zipCode, orderNote, paymentMethod } = req.body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Order items are required' });
    }
    if (!total || total <= 0) {
      return res.status(400).json({ success: false, message: 'Total amount is required and must be greater than 0' });
    }
    if (!shippingAddress || !phone || !city) {
      return res.status(400).json({ success: false, message: 'Shipping address, phone, and city are required' });
    }

    // Log the incoming request for debugging
    console.log('Creating new order with data:', {
      items,
      total,
      shippingAddress,
      phone,
      city,
      zipCode,
      orderNote,
      paymentMethod,
    });

    // Create the order
    const order = new Order({
      user: req.user._id,
      items,
      total,
      shippingAddress,
      phone,
      city,
      zipCode,
      orderNote,
      paymentMethod,
      status: 'pending',
    });

    await order.save();

    res.status(201).json({ success: true, message: 'Order created successfully', order });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ success: false, message: 'Failed to create order', error: error.message });
  }
});

// Get all orders (admin only)
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email')
      .populate('items.product')
      .sort({ createdAt: -1 });

    // Format orders with proper image URLs
    const formattedOrders = orders.map(order => {
      const orderObj = order.toObject();
      orderObj.items = orderObj.items.map(item => ({
        ...item,
        product: item.product ? formatProductWithImage(item.product) : null
      }));
      return orderObj;
    });

    res.json({
      success: true,
      orders: formattedOrders
    });
  } catch (error) {
    console.error('Error fetching all orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
});

// Get user's orders
router.get('/my-orders', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .populate('items.product')
      .sort({ createdAt: -1 });

    // Format orders with proper image URLs
    const formattedOrders = orders.map(order => {
      const orderObj = order.toObject();
      orderObj.items = orderObj.items.map(item => ({
        ...item,
        product: item.product ? formatProductWithImage(item.product) : null
      }));
      return orderObj;
    });

    res.json({
      success: true,
      orders: formattedOrders
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
});

// Update order status (admin only)
router.patch('/:orderId/status', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const order = await Order.findByIdAndUpdate(
      orderId,
      { status },
      { new: true }
    ).populate('items.product');

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
      message: 'Failed to update order status'
    });
  }
});

// Get single order
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate('items.product');

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    res.status(200).json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching order' 
    });
  }
});

// Delete order (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    
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

// Helper function to format product with full image URL
const formatProductWithImage = (product) => {
  if (!product) return null;
  
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';
  const productObj = product.toObject ? product.toObject() : product;
  
  return {
    ...productObj,
    image: productObj.image ? `${baseURL}/uploads/${productObj.image}` : null
  };
};

// Update the create order route to match frontend structure
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { items, total, shippingAddress, phone, city, paymentMethod } = req.body;

    // Validate required fields with better error messages
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order items are required and must be an array' 
      });
    }

    // Make more fields optional to prevent validation errors
    const order = new Order({
      user: req.user._id,
      items: items.map(item => ({
        product: item.product,
        quantity: item.quantity,
        price: item.price
      })),
      total: total || 0,
      shippingAddress: shippingAddress || "",
      phone: phone || "",
      city: city || "",
      paymentMethod: paymentMethod || "cod",
      status: 'pending',
      paymentStatus: paymentMethod === 'khalti' ? 'pending' : 'pending' // Fixed: Use 'pending' for COD orders
    });

    console.log('Creating order with data:', {
      user: req.user._id,
      items: items.length,
      total,
      paymentMethod
    });

    const savedOrder = await order.save();
    console.log('Order created successfully with ID:', savedOrder._id);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: savedOrder
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating order: ' + error.message,
      error: error.stack
    });
  }
});

// Add route to update stock
router.put('/product/:id/stock', authenticateToken, async (req, res) => {
  try {
    const { stock } = req.body;
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.stock = stock;
    await product.save();

    res.json({
      success: true,
      message: 'Stock updated successfully',
      product
    });
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating stock'
    });
  }
});

// Cancel order (for user)
router.put('/:orderId/cancel', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Find the order and verify ownership
    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id
    });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    // Check if order is in a cancellable state
    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending orders can be cancelled'
      });
    }
    
    // Update order status
    order.status = 'cancelled';
    await order.save();
    
    res.json({
      success: true,
      message: 'Order cancelled successfully',
      order
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order'
    });
  }
});

module.exports = router;
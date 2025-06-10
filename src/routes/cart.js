const express = require('express');
const router = express.Router();
const Cart = require('../model/cartModel');
const Product = require('../model/productModel');
const { authenticateUser } = require('../middleware/auth');

// Helper to format cart with full product details
const formatCart = async (cart) => {
  if (!cart) return { _id: null, items: [] };
  
  const cartObj = cart.toObject();
  const populatedItems = await Promise.all(
    cartObj.items.map(async (item) => {
      const product = await Product.findById(item.product);
      if (!product) return null;
      
      // Format product data
      const baseURL = process.env.BASE_URL || 'http://localhost:3000';
      let imagePath = null;
      if (product.image) {
        // Remove any duplicate 'uploads/' in the path
        const cleanImage = product.image.replace(/^uploads\//, '');
        imagePath = `${baseURL}/uploads/${cleanImage}`;
      }
      
      return {
        _id: product._id,
        name: product.name,
        price: product.price,
        image: imagePath,
        unit: product.unit,
        description: product.description,
        stock: product.stock,
        quantity: item.quantity
      };
    })
  );
  
  return {
    _id: cartObj._id,
    items: populatedItems.filter(item => item !== null)
  };
};

// Get user's cart
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Find user's cart and populate product details
    const cart = await Cart.findOne({ user: userId })
      .populate({
        path: 'items.product',
        select: 'name price description image stock unit'
      });
    
    if (!cart) {
      // Return empty cart structure if no cart exists
      return res.json({ 
        success: true, 
        cart: { items: [] }
      });
    }
    
    // Process images for each product
    const processedItems = cart.items.map(item => {
      if (!item.product) return null;
      
      // Format image URL
      const baseURL = process.env.BASE_URL || 'http://localhost:3000';
      let imagePath = null;
      if (item.product.image) {
        const cleanImage = item.product.image.replace(/^uploads\//, '');
        imagePath = `${baseURL}/uploads/${cleanImage}`;
      }
      
      return {
        ...item.toObject(),
        product: {
          ...item.product.toObject(),
          image: imagePath || null
        }
      };
    }).filter(item => item !== null);
    
    // Return formatted cart
    res.json({ 
      success: true, 
      cart: {
        _id: cart._id,
        items: processedItems
      }
    });
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).json({ success: false, message: "Failed to fetch cart" });
  }
});

// Add product to cart
router.post('/add', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Product ID is required' 
      });
    }

    // Verify product exists and has enough stock
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    if (product.stock < quantity) {
      return res.status(400).json({ 
        success: false, 
        message: 'Not enough stock available' 
      });
    }

    // Find user's cart or create a new one
    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = new Cart({ user: userId, items: [] });
    }

    // Check if product is already in cart
    const itemIndex = cart.items.findIndex(
      item => item.product.toString() === productId
    );

    if (itemIndex > -1) {
      // Update quantity if item exists
      cart.items[itemIndex].quantity += quantity;
    } else {
      // Add new item
      cart.items.push({
        product: productId,
        quantity
      });
    }

    await cart.save();

    // Return the complete cart with populated product details
    const populatedCart = await Cart.findOne({ user: userId })
      .populate({
        path: 'items.product',
        select: 'name price description image stock unit'
      });
      
    res.status(200).json({ 
      success: true,
      message: 'Product added to cart',
      cart: populatedCart
    });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to add to cart',
      error: error.message
    });
  }
});

// Update item quantity
router.put('/update', authenticateUser, async (req, res) => {
  try {
    // Check if req.user exists
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'User authentication failed'
      });
    }

    const { productId, quantity } = req.body;
    
    if (!productId || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Product ID and quantity are required'
      });
    }
    
    if (quantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be at least 1'
      });
    }
    
    // Verify product exists and has enough stock
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    if (product.stock < quantity) {
      return res.status(400).json({
        success: false,
        message: 'Not enough stock available'
      });
    }
    
    // Find cart
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }
    
    // Update item quantity
    const itemIndex = cart.items.findIndex(
      item => item.product.toString() === productId
    );
    
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in cart'
      });
    }
    
    cart.items[itemIndex].quantity = quantity;
    cart.updatedAt = Date.now();
    await cart.save();
    
    const formattedCart = await formatCart(cart);
    
    return res.json({
      success: true,
      message: 'Cart updated',
      cart: formattedCart
    });
  } catch (error) {
    console.error('Error updating cart:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update cart',
      error: error.message
    });
  }
});

// Remove item from cart
router.delete('/remove/:productId', authenticateUser, async (req, res) => {
  try {
    // Check if req.user exists
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'User authentication failed'
      });
    }

    const { productId } = req.params;
    
    // Find cart
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }
    
    // Remove item from cart
    cart.items = cart.items.filter(
      item => item.product.toString() !== productId
    );
    
    cart.updatedAt = Date.now();
    await cart.save();
    
    const formattedCart = await formatCart(cart);
    
    return res.json({
      success: true,
      message: 'Product removed from cart',
      cart: formattedCart
    });
  } catch (error) {
    console.error('Error removing from cart:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove product from cart',
      error: error.message
    });
  }
});

// Clear cart
router.delete('/clear', authenticateUser, async (req, res) => {
  try {
    // Check if req.user exists
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'User authentication failed'
      });
    }

    // Find cart
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }
    
    // Clear cart items
    cart.items = [];
    cart.updatedAt = Date.now();
    await cart.save();
    
    return res.json({
      success: true,
      message: 'Cart cleared',
      cart: { _id: cart._id, items: [] }
    });
  } catch (error) {
    console.error('Error clearing cart:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear cart',
      error: error.message
    });
  }
});

module.exports = router;

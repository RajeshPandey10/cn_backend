const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Product = require('../model/productModel');
const Order = require('../model/orderModel');
const Review = require('../model/reviewModel');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/reviews';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ storage });

// Helper function to get image URL
function getImageUrl(imagePath) {
  if (!imagePath) return null;
  
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';
  // Handle different path formats
  if (imagePath.startsWith('reviews/')) {
    return `${baseURL}/uploads/${imagePath}`;
  } else {
    return `${baseURL}/${imagePath}`;
  }
}

// Helper function to update product rating
async function updateProductRating(productId) {
  try {
    // Get all reviews for the product
    const reviews = await Review.find({ product: productId });
    
    // Calculate average rating
    let totalRating = 0;
    if (reviews.length > 0) {
      totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    }
    
    const averageRating = reviews.length > 0 ? totalRating / reviews.length : 0;
    
    // Update product with new rating and total reviews count
    await Product.findByIdAndUpdate(productId, {
      rating: averageRating,
      totalReviews: reviews.length
    });
    
    console.log(`Updated product ${productId} rating to ${averageRating} from ${reviews.length} reviews`);
  } catch (error) {
    console.error('Error updating product rating:', error);
  }
}

// Create review
router.post('/create', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    console.log('Review creation request received:', req.body);
    const { orderId, itemId, rating, comment } = req.body;

    // Validate required fields
    if (!orderId || !itemId || !rating) {
      return res.status(400).json({
        success: false,
        message: 'Order ID, Item ID, and Rating are required'
      });
    }

    // Validate rating is between 1-5
    const ratingValue = Number(rating);
    if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be a number between 1 and 5'
      });
    }

    // Find the order
    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
      status: 'delivered'
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or not delivered'
      });
    }

    // Find the item in the order
    const orderItem = order.items.find(item => item._id.toString() === itemId);
    if (!orderItem) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in order'
      });
    }

    // Check if user already reviewed this product for this order
    const existingReview = await Review.findOne({
      user: req.user._id,
      product: orderItem.product,
      order: orderId
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this product for this order'
      });
    }

    // Create and save the review
    const review = new Review({
      user: req.user._id,
      product: orderItem.product,
      order: orderId,
      rating: ratingValue,
      comment: comment || '',
      image: req.file ? `reviews/${req.file.filename}` : null
    });

    await review.save();

    // Mark item as reviewed
    orderItem.reviewed = true;
    await order.save();

    // Update product rating
    await updateProductRating(orderItem.product);

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      review
    });

  } catch (error) {
    console.error('Error creating review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit review'
    });
  }
});

// Get reviews for a product
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const reviews = await Review.find({ product: productId })
      .populate('user', 'name')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      reviews
    });
  } catch (error) {
    console.error('Error fetching product reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
});

// Get all reviews for the logged-in user
router.get('/user', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const reviews = await Review.find({ user: userId })
      .populate('product', 'name image')
      .populate('order')
      .sort({ createdAt: -1 });
    
    // Format reviews
    const formattedReviews = reviews.map(review => {
      const reviewObj = review.toObject();
      
      // Format product image if exists
      if (reviewObj.product && reviewObj.product.image) {
        reviewObj.product.image = getImageUrl(reviewObj.product.image);
      }
      
      return reviewObj;
    });
    
    res.json({
      success: true,
      reviews: formattedReviews
    });
  } catch (error) {
    console.error('Error fetching user reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
});

// Check if a product can be reviewed or has already been reviewed
router.get('/check/:orderId/:productId', authenticateToken, async (req, res) => {
  try {
    const { orderId, productId } = req.params;
    const userId = req.user._id;

    // Check if order exists and is delivered
    const order = await Order.findOne({
      _id: orderId,
      user: userId,
      status: 'delivered',
      'items.product': productId
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or not eligible for review'
      });
    }

    // Check if user has already reviewed this product for this order
    const existingReview = await Review.findOne({
      user: userId,
      product: productId,
      order: orderId
    });

    if (existingReview) {
      return res.json({
        success: true,
        canReview: true,
        hasReviewed: true,
        review: existingReview
      });
    }

    // User can review this product
    return res.json({
      success: true,
      canReview: true,
      hasReviewed: false
    });
  } catch (error) {
    console.error('Error checking review status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check review status'
    });
  }
});

// Update an existing review
router.post('/update/:reviewId', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user._id;

    // Validate rating
    const ratingValue = Number(rating);
    if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be a number between 1 and 5'
      });
    }

    // Find the review and verify ownership
    const review = await Review.findOne({
      _id: reviewId,
      user: userId
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found or you do not have permission to edit it'
      });
    }

    // Update the review
    review.rating = ratingValue;
    review.comment = comment || '';
    
    // Handle image update if provided
    if (req.file) {
      // Delete previous image if exists
      if (review.image) {
        const oldImagePath = path.join(__dirname, '../../uploads/', review.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      review.image = `reviews/${req.file.filename}`;
    }

    await review.save();

    // Update product rating after review update
    await updateProductRating(review.product);

    res.json({
      success: true,
      message: 'Review updated successfully',
      review
    });
  } catch (error) {
    console.error('Error updating review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update review'
    });
  }
});

// Delete a review (for users to delete their own reviews)
router.delete('/:reviewId', authenticateToken, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user._id;
    
    // Find and ensure the review belongs to the user
    const review = await Review.findOne({
      _id: reviewId,
      user: userId
    });
    
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found or you do not have permission to delete it'
      });
    }

    // Store the product id before deletion
    const productId = review.product;
    
    // Delete the review image if exists
    if (review.image) {
      const imagePath = path.join(__dirname, '../../uploads/', review.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    await Review.deleteOne({ _id: reviewId });
    
    // Update product rating after review deletion
    await updateProductRating(productId);
    
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

module.exports = router;
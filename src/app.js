const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();
require('./dbConnection/database')();
require('dotenv').config();
const createDirectories = require('./utils/createDirectories');
const { handleUploadError } = require('./middleware/upload');
const PORT = process.env.PORT || 3000;
// Import routes
const adminRoutes = require('./routes/Admin'); // Ensure the case matches your file name
const productRoutes = require('./routes/product');
const orderRoutes = require('./routes/order');
const userAuthRoutes = require('./routes/userAuth');
const reviewRoutes = require('./routes/review');
const cartRoutes = require('./routes/cart');
const wishlistRoutes = require('./routes/wishlist');
const paymentRoutes = require('./routes/payment'); // Add this line

// Middleware
app.use(cors({
  origin: '*', // Replace with your frontend domain
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/uploads/reviews', express.static(path.join(__dirname, '../uploads/reviews')));

// Create necessary directories
createDirectories();

// Routes
app.use('/api/admin', adminRoutes);
app.use('/api/user', userAuthRoutes);
app.use('/api/product', productRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/payment', paymentRoutes); // Add this line to register payment routes

// MongoDB connection
mongoose.connect(process.env.MONGODB_URL)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: err.message
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('Registered routes:', app._router.stack
    .filter(r => r.route)
    .map(r => `${Object.keys(r.route.methods)} ${r.route.path}`));
}); 

module.exports = app;
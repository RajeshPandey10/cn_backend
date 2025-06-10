const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../model/userModel');
const { authenticateToken, authenticateAdmin, authenticateUser } = require('../middleware/auth');
const authController = require('../controllers/auth-controller');

// Register user
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body;
    
    // Validate password
    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long"
      });
    }

    // Generate a fallback username if not provided
    const username = req.body.username
      ? req.body.username.toLowerCase()
      : name.replace(/\s+/g, '').toLowerCase();

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email: email.toLowerCase() },
        { username: username },
        { phone: phone }
      ]
    });

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return res.status(400).json({ message: "Email already registered" });
      }
      if (existingUser.username === username) {
        return res.status(400).json({ message: "Username already taken" });
      }
      if (existingUser.phone === phone) {
        return res.status(400).json({ message: "Phone number already registered" });
      }
    }

    // Remove manual hashing; pass raw password so that the userModel pre-save hook hashes it
    const user = new User({
      name,
      email: email.toLowerCase(),
      password, // Use raw password; it will be hashed by the pre-save hook
      username,
      phone,
      address: address || ""
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: "User registered successfully"
    });
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Registration failed"
    });
  }
});

// Register with OTP
router.post('/register-with-otp', authController.Register);

// Resend OTP
router.post('/resend-otp', authController.ResendOTP);

// Verify Email with OTP
router.post('/verify-email', authController.VerifyEmail);

// Removed stray route definitions that were causing the callback undefined error:
// router.post("/resend-otp"), async ({ email, otp_code, otp_expiration }) => { ... }
// router.post("/verify"), async ({email, otp_code})=>{ ... }

// Login user
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log(`Signin attempt with email: ${email}`);
    console.log(`Request payload:`, req.body);

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      console.error(`User with email ${email} not found`);
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    console.log(`Password comparison result for user ${email}: ${isMatch}`);
    console.log(`Entered password: ${password}`);
    console.log(`Stored hashed password: ${user.password}`);
    
    if (!isMatch) {
      console.error(`Incorrect password for user with email ${email}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is blocked
    if (user.isBlocked) {
      console.error(`Login failed: User with email ${email} is blocked`);
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked'
      });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user._id }, // no extra fields for user login
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '7d' }
    );

    console.log(`Login successful: User with email ${email} logged in`);
    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during login'
    });
  }
});

// Get user profile
router.get('/profile', authenticateUser, async (req, res) => {
  try {
    const user = req.user; // Use req.user
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
      },
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
    });
  }
});

// Update user profile
router.put('/profile', authenticateUser, async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    
    // Check if email already exists
    if (email !== req.user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
    }

    // Log the request data for debugging
    console.log('Profile update request:', { name, email, phone, address });

    // Update user profile with ALL fields including address
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, email, phone, address },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Log the updated user for debugging
    console.log('Updated user:', user);

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile'
    });
  }
});

// Change password
router.post('/change-password', authenticateUser, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Find user
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    user.password = hashedPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
    });
  }
});

// Delete profile
router.delete('/profile', authenticateUser, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    res.json({
      success: true,
      message: 'Profile deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting profile'
    });
  }
});

// Get all users route
router.get('/all', authenticateAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      users: users.map(user => ({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        isActive: user.isActive,
        createdAt: user.createdAt,
        password: user.password // Include the plain text password (not recommended)
      }))
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users'
    });
  }
});

// Toggle user status route
router.put('/toggle-status/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      success: true,
      message: `User ${user.isActive ? 'unblocked' : 'blocked'} successfully`,
      user: {
        _id: user._id,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Error toggling user status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user status'
    });
  }
});

// Delete user route
router.delete('/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User deleted successfully',
      userId: user._id
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user'
    });
  }
});

// Forgot Password - Send OTP
router.post('/forgot-password', authController.ForgotPassword);

// Verify OTP for Password Reset
router.post('/verify-password-reset-otp', authController.VerifyPasswordResetOTP);

// Reset Password
router.post('/reset-password', authController.ResetPassword);

module.exports = router;

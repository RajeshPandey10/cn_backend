const express = require('express');
const router = express.Router();
const axios = require('axios');
const BookingGym = require('../models/BookingGym');
const BookingTrainer = require('../models/BookingTrainer');
const authMiddleware = require('../middleware/authMiddleware');

// Environment variables
const KHALTI_SECRET_KEY = '01b5de2f517742d5886ff473a1e9d794'; // Use the specific key provided
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173'; // Frontend URL
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api'; // Backend API URL

// API base URLs for Khalti
const KHALTI_API_BASE = process.env.NODE_ENV === 'production' 
  ? 'https://khalti.com/api/v2'
  : 'https://dev.khalti.com/api/v2';

/**
 * Initiate a payment with Khalti
 * @route POST /payments/initiate-payment
 */
router.post('/initiate-payment', authMiddleware, async (req, res) => {
  try {
    const { 
      bookingId, 
      bookingType, // 'gym' or 'trainer'
      amount, 
      customer_info,
      return_url // Allow frontend to provide its own return_url
    } = req.body;
    
    console.log('Payment initiation request received:', { 
      bookingId, 
      bookingType,
      amount,
      hasCustomerInfo: !!customer_info, 
      userId: req.user?.id 
    });
    
    if (!bookingId || !amount || !bookingType) {
      console.log('Missing required fields', { bookingId, bookingType, amount });
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: bookingId, amount, and bookingType are required' 
      });
    }
    
    // Validate booking type
    if (!['gym', 'trainer'].includes(bookingType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking type. Must be "gym" or "trainer"'
      });
    }
    
    if (!KHALTI_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Payment system configuration error: Missing Khalti secret key'
      });
    }

    // Find the booking to ensure it exists and belongs to the authenticated user
    let booking;
    try {
      if (bookingType === 'gym') {
        booking = await BookingGym.findOne({ 
          _id: bookingId,
          user: req.user.id
        });
      } else {
        booking = await BookingTrainer.findOne({ 
          _id: bookingId,
          user: req.user.id
        });
      }

      if (!booking) {
        console.log(`${bookingType} booking not found with ID ${bookingId}`);
        return res.status(404).json({
          success: false,
          message: `${bookingType} booking not found`
        });
      }
      
      // FIX: Debug log the booking status to identify issues
      console.log('Found booking with status:', bookingType === 'gym' ? 
        booking.payment?.status : booking.paymentStatus, 
        'and booking status:', booking.status);
      
      // FIX: Only check for completed status, not initiated or pending
      const isPaid = bookingType === 'gym' 
        ? (booking.payment?.status === 'completed') 
        : (booking.paymentStatus === 'completed');

      if (isPaid) {
        console.log('Booking is already paid for:', { bookingId, bookingType });
        return res.status(400).json({
          success: false,
          message: 'This booking is already paid for. Please check your booking details.'
        });
      }
    } catch (err) {
      console.error('Error finding booking:', err);
      return res.status(500).json({
        success: false,
        message: 'Error looking up booking information'
      });
    }

    // Use the provided return_url or fallback to the BASE_URL
    const finalReturnUrl = return_url || `${BASE_URL}/dashboard/payment-confirmation`;
    
    // Generate a purchase_order_name based on the booking type
    const purchase_order_name = bookingType === 'gym' 
      ? `Gym Session: ${booking.workoutType}`
      : `Trainer Session with ${booking.trainer?.name || 'Trainer'}`;

    // Default customer info if not provided
    const defaultCustomerInfo = {
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phoneNumber
    };

    // Prepare payload for Khalti API
    const payload = {
      return_url: finalReturnUrl,
      website_url: BASE_URL,
      amount: Math.round(amount * 100), // Khalti expects amount in paisa (100 paisa = 1 NPR)
      purchase_order_id: bookingId,
      purchase_order_name,
      customer_info: customer_info || defaultCustomerInfo,
      product_details: [
        {
          identity: bookingId,
          name: purchase_order_name,
          total_price: Math.round(amount * 100),
          quantity: 1,
          unit_price: Math.round(amount * 100)
        }
      ],
      amount_breakdown: [
        {
          label: bookingType === 'gym' ? 'Gym Session Fee' : 'Trainer Session Fee',
          amount: Math.round(amount * 100)
        }
      ],
      metadata: {
        bookingType,
        userId: req.user.id
      }
    };
    
    console.log('Initiating Khalti payment with payload:', {
      ...payload,
      customer_info: { ...payload.customer_info, email: '***@***' } // Redact email for logging
    });
    
    // Make request to Khalti API
    const response = await axios.post(
      `${KHALTI_API_BASE}/epayment/initiate/`,
      payload,
      {
        headers: {
          'Authorization': `Key ${KHALTI_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Khalti initiate response:', response.data);
    
    // Save the payment initiation details to the booking
    if (bookingType === 'gym') {
      await BookingGym.findByIdAndUpdate(
        bookingId,
        {
          'payment.method': 'khalti',
          'payment.status': 'initiated',
          'payment.khaltiPidx': response.data.pidx
        }
      );
    } else {
      await BookingTrainer.findByIdAndUpdate(
        bookingId,
        {
          paymentMethod: 'khalti',
          paymentStatus: 'initiated',
          khaltiPidx: response.data.pidx
        }
      );
    }
    
    // Return Khalti payment URL to frontend
    return res.status(200).json({
      success: true,
      data: response.data,
      message: 'Payment initiated successfully'
    });
  } catch (error) {
    console.error('Payment initiation error:', error.response?.data || error.message);
    
    return res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.detail || 'Failed to initiate payment',
      error: error.response?.data || error.message
    });
  }
});

/**
 * Verify payment using Khalti lookup API
 * @route POST /payments/verify-khalti-lookup
 */
router.post('/verify-khalti', authMiddleware, async (req, res) => {
  try {
    const { pidx, bookingType } = req.body;
    
    if (!pidx || !bookingType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: pidx and bookingType'
      });
    }
    
    // Validate booking type
    if (!['gym', 'trainer'].includes(bookingType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking type. Must be "gym" or "trainer"'
      });
    }
    
    if (!KHALTI_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Payment system configuration error: Missing Khalti secret key'
      });
    }
    
    // Verify the payment status with Khalti
    const response = await axios.post(
      `${KHALTI_API_BASE}/epayment/lookup/`,
      { pidx },
      {
        headers: {
          'Authorization': `Key ${KHALTI_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Khalti lookup response:', response.data);
    
    // Find the booking by Khalti pidx
    let booking;
    if (bookingType === 'gym') {
      booking = await BookingGym.findOne({ 'payment.khaltiPidx': pidx });
    } else {
      booking = await BookingTrainer.findOne({ khaltiPidx: pidx });
    }
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: `${bookingType} booking not found`
      });
    }
    
    // Check if the payment is completed
    if (response.data.status === 'Completed') {
      // Update the booking based on type
      if (bookingType === 'gym') {
        await BookingGym.findByIdAndUpdate(
          booking._id,
          {
            'payment.status': 'completed',
            'payment.transactionId': response.data.transaction_id,
            'payment.details': response.data,
            status: 'confirmed' // Auto-confirm booking once payment is confirmed
          },
          { new: true }
        );
      } else {
        await BookingTrainer.findByIdAndUpdate(
          booking._id,
          {
            paymentStatus: 'completed',
            transactionId: response.data.transaction_id,
            paymentDetails: response.data,
            status: 'confirmed' // Auto-confirm booking once payment is confirmed
          },
          { new: true }
        );
      }
      
      // Get updated booking with payment details
      const updatedBooking = bookingType === 'gym' 
        ? await BookingGym.findById(booking._id)
        : await BookingTrainer.findById(booking._id).populate('trainer', 'name');
      
      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        data: response.data,
        booking: updatedBooking
      });
    } else if (response.data.status === 'Pending') {
      return res.status(202).json({
        success: false,
        message: 'Payment is pending',
        data: response.data
      });
    } else {
      // Payment expired, canceled, etc.
      if (bookingType === 'gym') {
        await BookingGym.findByIdAndUpdate(
          booking._id,
          {
            'payment.status': 'failed',
            'payment.details': response.data
          }
        );
      } else {
        await BookingTrainer.findByIdAndUpdate(
          booking._id,
          {
            paymentStatus: 'failed',
            paymentDetails: response.data
          }
        );
      }
      
      return res.status(400).json({
        success: false,
        message: `Payment ${response.data.status}`,
        data: response.data
      });
    }
  } catch (error) {
    console.error('Payment lookup error:', error.response?.data || error.message);
    
    return res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.detail || 'Payment verification failed',
      error: error.response?.data || error.message
    });
  }
});

/**
 * Handle GET requests for payment returns from Khalti
 * This route handles when users are redirected back from Khalti
 * @route GET /payment-return
 */
router.get('/payment-return', async (req, res) => {
  // Log the incoming request for debugging
  console.log('Payment return request received:', req.query);
  
  const { pidx, status, purchase_order_id, purchase_order_name } = req.query;
  
  if (pidx) {
    // For API-based apps, redirect to the frontend with all query parameters preserved
    const queryString = new URLSearchParams(req.query).toString();
    return res.redirect(`${BASE_URL}/dashboard/payment-confirmation?${queryString}`);
  }
  
  // If this is not a return from Khalti, just redirect to the frontend
  return res.redirect(`${BASE_URL}/dashboard`);
});

/**
 * Endpoint to handle webhook notifications from Khalti
 * @route POST /payments/khalti-webhook
 */
router.post('/khalti-webhook', async (req, res) => {
  try {
    const eventData = req.body;
    console.log('Received webhook from Khalti:', eventData);
    
    // Extract relevant information
    const pidx = eventData.pidx;
    const status = eventData.status;
    const transaction_id = eventData.transaction_id;
    const purchase_order_id = eventData.purchase_order_id;
    
    if (!pidx) {
      console.error('No pidx in webhook data');
      return res.status(200).send('Missing payment identifier');
    }
    
    // Check both booking types for the pidx
    const gymBooking = await BookingGym.findOne({ 'payment.khaltiPidx': pidx });
    const trainerBooking = await BookingTrainer.findOne({ khaltiPidx: pidx });
    
    // Process based on which booking was found
    if (gymBooking) {
      if (status === 'Completed') {
        // Update gym booking as paid
        await BookingGym.findByIdAndUpdate(
          gymBooking._id,
          {
            'payment.status': 'completed',
            'payment.transactionId': transaction_id,
            'payment.details': eventData,
            status: 'confirmed' // Auto-confirm booking
          }
        );
      } else if (status === 'Refunded' || status === 'Partially refunded') {
        // Update gym booking as refunded
        await BookingGym.findByIdAndUpdate(
          gymBooking._id,
          {
            'payment.status': 'refunded',
            'payment.details': eventData
          }
        );
      }
    } else if (trainerBooking) {
      if (status === 'Completed') {
        // Update trainer booking as paid
        await BookingTrainer.findByIdAndUpdate(
          trainerBooking._id,
          {
            paymentStatus: 'completed',
            transactionId: transaction_id,
            paymentDetails: eventData,
            status: 'confirmed' // Auto-confirm booking
          }
        );
      } else if (status === 'Refunded' || status === 'Partially refunded') {
        // Update trainer booking as refunded
        await BookingTrainer.findByIdAndUpdate(
          trainerBooking._id,
          {
            paymentStatus: 'refunded',
            paymentDetails: eventData
          }
        );
      }
    } else {
      console.error('No booking found for pidx:', pidx);
    }
    
    // Always respond with 200 to webhook calls
    return res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Always respond with 200 even if processing fails
    return res.status(200).send('Webhook received');
  }
});

/**
 * Get payment status by booking ID
 * @route GET /payments/status/:bookingType/:bookingId
 */
router.get('/status/:bookingType/:bookingId', authMiddleware, async (req, res) => {
  try {
    const { bookingType, bookingId } = req.params;
    
    if (!['gym', 'trainer'].includes(bookingType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking type. Must be "gym" or "trainer"'
      });
    }
    
    // Find the booking
    let booking;
    if (bookingType === 'gym') {
      booking = await BookingGym.findOne({ 
        _id: bookingId,
        user: req.user.id
      });
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Gym booking not found'
        });
      }
      
      return res.json({
        success: true,
        bookingId: booking._id,
        paymentStatus: booking.payment?.status || 'unknown',
        paymentMethod: booking.payment?.method || 'unknown',
        transactionId: booking.payment?.transactionId,
        amount: booking.payment?.amount,
        bookingStatus: booking.status
      });
    } else {
      booking = await BookingTrainer.findOne({ 
        _id: bookingId,
        user: req.user.id
      });
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Trainer booking not found'
        });
      }
      
      return res.json({
        success: true,
        bookingId: booking._id,
        paymentStatus: booking.paymentStatus || 'unknown',
        paymentMethod: booking.paymentMethod || 'unknown',
        transactionId: booking.transactionId,
        amount: booking.amount,
        bookingStatus: booking.status
      });
    }
  } catch (error) {
    console.error('Error fetching payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment status',
      error: error.message
    });
  }
});

// Updated payment verification endpoint
router.post('/verify-payment', async (req, res) => {
  try {
    const { transactionId, bookingId, bookingType, amount, status } = req.body;
    
    console.log('Payment verification request:', { transactionId, bookingId, bookingType, amount, status });
    
    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID is required'
      });
    }
    
    // Determine which model to use
    let BookingModel;
    if (bookingType === 'trainer') {
      BookingModel = require('../models/BookingTrainer');
    } else {
      // Default to gym booking
      BookingModel = require('../models/BookingGym');
    }
    
    // Find the booking - handle potential ObjectID issues safely
    let booking;
    try {
      booking = await BookingModel.findById(bookingId);
    } catch (error) {
      console.error('Error finding booking by ID:', error);
      
      // Try alternative approaches if standard ObjectId fails
      try {
        // Try exact string match (some systems store IDs as strings)
        booking = await BookingModel.findOne({ 
          $or: [
            { _id: bookingId },
            { externalId: bookingId },
            { 'paymentDetails.orderId': bookingId },
            { 'paymentReference': bookingId }
          ]
        });
      } catch (fallbackError) {
        console.error('Fallback query failed:', fallbackError);
      }
    }
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    // Update booking payment status
    booking.paymentStatus = status === 'Completed' ? 'completed' : booking.paymentStatus;
    
    // Set payment details
    booking.paymentDetails = {
      ...(booking.paymentDetails || {}),
      transactionId,
      verifiedAt: new Date(),
      verificationStatus: status,
      verificationAmount: amount
    };
    
    // If status is pending and payment completed, update it to confirmed
    if (booking.status === 'pending' && status === 'Completed') {
      booking.status = 'confirmed';
    }
    
    await booking.save();
    
    res.json({
      success: true,
      message: 'Payment verification successful',
      booking: {
        _id: booking._id,
        paymentStatus: booking.paymentStatus,
        status: booking.status,
        paymentDetails: booking.paymentDetails
      }
    });
  } catch (error) {
    console.error('Error during payment verification:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
    });
  }
});

// Add Khalti payment verification endpoint for redirect/callback
router.post('/verify-khalti-payment', async (req, res) => {
  try {
    const { token, pidx, purchaseOrderId, amount, status, bookingType } = req.body;
    
    console.log('Verifying Khalti payment after redirect:', {
      token, pidx, purchaseOrderId, amount, status, bookingType
    });
    
    if (!purchaseOrderId || !token) {
      return res.status(400).json({
        success: false,
        message: 'Token and purchase order ID are required'
      });
    }
    
    // Convert string to ObjectId to ensure proper matching
    const mongoose = require('mongoose');
    let bookingId;
    try {
      bookingId = mongoose.Types.ObjectId(purchaseOrderId);
    } catch (error) {
      console.error('Invalid ObjectId format:', error);
      return res.status(400).json({
        success: false,
        message: 'Invalid booking ID format'
      });
    }
    
    // Determine which model to use based on bookingType
    let BookingModel;
    if (bookingType === 'trainer') {
      BookingModel = require('../models/BookingTrainer');
    } else {
      BookingModel = require('../models/BookingGym'); // Default to gym booking
    }
    
    // Find the booking using the ID
    const booking = await BookingModel.findById(bookingId);
    
    if (!booking) {
      console.error(`${bookingType} booking not found with ID:`, purchaseOrderId);
      return res.status(404).json({
        success: false,
        message: `${bookingType} booking not found`
      });
    }
    
    console.log(`Found ${bookingType} booking:`, booking._id);
    
    // Update booking payment details
    booking.paymentStatus = status === 'Completed' ? 'completed' : 'failed';
    booking.paymentDetails = {
      khaltiToken: token,
      khaltiPidx: pidx,
      amount: amount,
      verifiedAt: new Date()
    };
    
    // If payment successful and booking was pending, set it to confirmed
    if (status === 'Completed' && booking.status === 'pending') {
      booking.status = 'confirmed';
    }
    
    await booking.save();
    
    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      booking: {
        _id: booking._id,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        sessionDate: booking.sessionDate || booking.bookingDate
      }
    });
  } catch (error) {
    console.error('Error verifying Khalti payment:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing payment verification',
      error: error.message
    });
  }
});

module.exports = router;

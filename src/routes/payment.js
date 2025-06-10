const express = require('express');
const router = express.Router();
const axios = require('axios');
const Order = require('../model/orderModel');
const authMiddleware = require('../middleware/auth');

// Environment variables - Using test keys and test API endpoint
const KHALTI_SECRET_KEY = process.env.KHALTI_SECRET_KEY;
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
// Use correct test API endpoint for Khalti test keys
const KHALTI_API_BASE = 'https://dev.khalti.com/api/v2';

if (!KHALTI_SECRET_KEY) {
  console.error('KHALTI_SECRET_KEY is not set! Please check your .env file.');
}

/**
 * Initiate a payment with Khalti for an order
 * @route POST /payment/khalti/initiate
 */
router.post('/khalti/initiate', authMiddleware.authenticateToken, async (req, res) => {
  try {
    const { orderId, amount } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: orderId and amount are required',
      });
    }

    const order = await Order.findOne({ _id: orderId, user: req.user._id });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (order.paymentStatus === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'This order is already paid for.',
      });
    }

    // Ensure amount is in paisa (1 NPR = 100 paisa)
    const amountInPaisa = Math.round(amount * 100);

    // Construct a simplified payload according to Khalti API documentation
    const payload = {
      return_url: `${BASE_URL}/payment-confirmation`,
      website_url: BASE_URL,
      amount: amountInPaisa,
      purchase_order_id: orderId.toString(),
      purchase_order_name: `Order #${orderId}`,
      customer_info: {
        name: req.user.name || "Customer",
        email: req.user.email || "customer@example.com",
        phone: req.user.phoneNumber || "9800000001",
      },
      product_details: [{
        identity: orderId.toString(),
        name: `Order #${orderId}`,
        total_price: amountInPaisa,
        quantity: 1,
        unit_price: amountInPaisa
      }]
    };

    console.log('Initiating Khalti payment with payload:', JSON.stringify(payload));

    // Make request to Khalti API with proper authentication
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

    console.log('Khalti response:', response.data);

    // Update order with payment information
    order.paymentMethod = 'khalti';
    order.paymentStatus = 'initiated';
    order.paymentDetails = { 
      khaltiPidx: response.data.pidx,
      initiatedAt: new Date()
    };
    await order.save();

    res.status(200).json({
      success: true,
      payment_url: response.data.payment_url,
      message: 'Payment initiated successfully',
    });
  } catch (error) {
    console.error('Payment initiation error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate payment',
      error: error.response?.data || error.message,
    });
  }
});

/**
 * Verify payment using Khalti lookup API
 * @route POST /payment/khalti/verify
 */
router.post('/khalti/verify', authMiddleware.authenticateToken, async (req, res) => {
  try {
    const { pidx, orderId } = req.body;

    if (!pidx || !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: pidx and orderId',
      });
    }

    const response = await axios.post(
      `${KHALTI_API_BASE}/epayment/lookup/`,
      { pidx },
      {
        headers: {
          Authorization: `Key ${KHALTI_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const order = await Order.findOne({ _id: orderId, 'paymentDetails.khaltiPidx': pidx });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (response.data.status === 'Completed') {
      order.paymentStatus = 'completed';
      order.paymentDetails = {
        ...order.paymentDetails,
        transactionId: response.data.transaction_id,
        details: response.data,
      };
      order.status = 'processing';
      await order.save();

      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        data: response.data,
        order,
      });
    } else {
      order.paymentStatus = 'failed';
      order.paymentDetails = { ...order.paymentDetails, details: response.data };
      await order.save();

      return res.status(400).json({
        success: false,
        message: `Payment ${response.data.status}`,
        data: response.data,
      });
    }
  } catch (error) {
    console.error('Payment verification error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.response?.data || error.message,
    });
  }
});

module.exports = router;

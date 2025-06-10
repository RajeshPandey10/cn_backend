/**
 * Simple payment service for testing
 * This can be used to mock the Khalti payment without actual integration
 */

// Mock Khalti payment URL generation
function generatePaymentUrl(orderId, amount) {
  console.log(`Generating mock payment URL for order ${orderId} with amount Rs.${amount}`);
  // In a production environment, this would be a real Khalti URL
  return `http://localhost:5173/payment-simulation?orderId=${orderId}&amount=${amount}`;
}

// Mock payment verification
function verifyPayment(paymentData) {
  console.log('Verifying mock payment:', paymentData);
  return {
    success: true,
    status: 'Completed',
    transaction_id: `mock-transaction-${Date.now()}`
  };
}

module.exports = {
  generatePaymentUrl,
  verifyPayment
};

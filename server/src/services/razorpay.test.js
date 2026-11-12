import { createHmac } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PAYMENT_CURRENCY, paymentMatchesBooking, verifyRazorpaySignature } from './razorpay.js';

test('verifies a Razorpay checkout signature against the server order ID', () => {
  const keySecret = 'test-secret';
  const orderId = 'order_test';
  const paymentId = 'pay_test';
  const signature = createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');

  assert.equal(verifyRazorpaySignature({ orderId, paymentId, signature, keySecret }), true);
  assert.equal(verifyRazorpaySignature({ orderId: 'order_other', paymentId, signature, keySecret }), false);
  assert.equal(verifyRazorpaySignature({ orderId, paymentId, signature: 'invalid', keySecret }), false);
});

test('accepts only payments matching the booking order, amount, and INR currency', () => {
  const payment = { order_id: 'order_test', amount: 12500, currency: PAYMENT_CURRENCY };

  assert.equal(paymentMatchesBooking(payment, 'order_test', 12500), true);
  assert.equal(paymentMatchesBooking(payment, 'order_other', 12500), false);
  assert.equal(paymentMatchesBooking(payment, 'order_test', 12501), false);
  assert.equal(paymentMatchesBooking({ ...payment, currency: 'USD' }, 'order_test', 12500), false);
});

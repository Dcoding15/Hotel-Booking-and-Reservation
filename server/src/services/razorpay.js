import { createHmac, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';
import { HttpError } from '../utils.js';

export const PAYMENT_CURRENCY = 'INR';
export const PAYMENT_HOLD_MS = 15 * 60 * 1000;

export function getRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new HttpError(503, 'Online payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server/.env.');
  }
  return { keyId, keySecret };
}

export function razorpayClient() {
  const { keyId, keySecret } = getRazorpayConfig();
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

async function providerCall(action, message) {
  try {
    return await action();
  } catch (error) {
    throw new HttpError(502, error?.error?.description || error?.message || message);
  }
}

export function createRazorpayOrder(client, details) {
  return providerCall(() => client.orders.create(details), 'Razorpay could not create the payment order.');
}

export function fetchRazorpayPayment(client, paymentId) {
  return providerCall(() => client.payments.fetch(paymentId), 'Razorpay could not verify the payment.');
}

export function captureRazorpayPayment(client, paymentId, amount) {
  return providerCall(
    () => client.payments.capture(paymentId, amount, PAYMENT_CURRENCY),
    'Razorpay could not capture the payment.',
  );
}

export function verifyRazorpaySignature({ orderId, paymentId, signature, keySecret }) {
  if (!orderId || !paymentId || !keySecret || !/^[a-f\d]{64}$/i.test(signature || '')) return false;
  const expected = createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest();
  const actual = Buffer.from(signature, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function paymentMatchesBooking(payment, orderId, amount) {
  return payment?.order_id === orderId
    && Number(payment.amount) === amount
    && payment.currency === PAYMENT_CURRENCY;
}

export async function createRazorpayRefund({ paymentId, bookingId, amount, idempotencyKey }) {
  const { keyId, keySecret } = getRazorpayConfig();
  let response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
        'X-Refund-Idempotency': idempotencyKey,
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        amount,
        receipt: bookingId,
        notes: { booking_id: bookingId },
      }),
    });
  } catch {
    throw new HttpError(502, 'Razorpay could not confirm the refund request. Retry safely or contact support.');
  }

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const status = response.status === 409 ? 503 : 502;
    throw new HttpError(status, result?.error?.description || 'Razorpay could not confirm the refund request. Retry safely or contact support.');
  }
  if (!result?.id || !['pending', 'processed', 'failed'].includes(result.status)) {
    throw new HttpError(502, 'Razorpay returned an invalid refund response. Retry safely or contact support.');
  }
  return result;
}

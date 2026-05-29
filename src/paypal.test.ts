import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePaypalEmail } from './paypal';

// Captured from a real PayPal Debit Card receipt (HTML email rendered to text).
const SAMPLE_SUBJECT = "Here's your receipt for your PayPal Debit Card purchase";
const SAMPLE_BODY = `Here's your receipt for your PayPal Debit Card purchase
You used your PayPal Debit Mastercard at MEIJER STORE #104 on May 28, 2026.
Payment Details
Transaction ID
0N312199M6088954U\tTransaction date
May 28, 2026
Transaction type:\tPurchase
Merchant:\tMEIJER STORE #104
PayPal Rewards
Congrats! You earned 283 points on this purchase.
Terms apply.
Final transaction amount\t$56.61 USD
Total amount\t$56.61 USD
Available PayPal balance\t$286.53 USD`;

test('parses a standard PayPal Debit Card purchase receipt', () => {
  const txn = parsePaypalEmail(SAMPLE_SUBJECT, SAMPLE_BODY);
  assert.ok(txn, 'expected a parsed transaction');
  assert.equal(txn.transactionId, '0N312199M6088954U');
  assert.equal(txn.merchant, 'MEIJER STORE #104');
  assert.equal(txn.date, '2026-05-28');
  assert.equal(txn.amount, -56.61); // purchase = outflow
  assert.equal(txn.type, 'Purchase');
});

test('treats a refund as an inflow (positive amount)', () => {
  const body = SAMPLE_BODY.replace('Transaction type:\tPurchase', 'Transaction type:\tRefund');
  const txn = parsePaypalEmail('Your PayPal Debit Card refund', body);
  assert.ok(txn);
  assert.equal(txn.amount, 56.61);
  assert.equal(txn.type, 'Refund');
});

test('parses amounts with thousands separators', () => {
  const body = SAMPLE_BODY.replace('Final transaction amount\t$56.61 USD', 'Final transaction amount\t$1,234.56 USD');
  const txn = parsePaypalEmail(SAMPLE_SUBJECT, body);
  assert.ok(txn);
  assert.equal(txn.amount, -1234.56);
});

test('falls back to the summary-line date when no explicit Transaction date', () => {
  const body = SAMPLE_BODY.replace('0N312199M6088954U\tTransaction date\nMay 28, 2026\n', '0N312199M6088954U\n');
  const txn = parsePaypalEmail(SAMPLE_SUBJECT, body);
  assert.ok(txn);
  assert.equal(txn.date, '2026-05-28'); // from "...on May 28, 2026."
});

// Real Gmail plain-text rendering of a *manually forwarded* receipt: markdown
// emphasis asterisks around labels/values, and the "Transaction date" label
// broken across a newline.
const FORWARDED_BODY = `---------- Forwarded message ---------
From: service@paypal.com <service@paypal.com>
Subject: Receipt for your PayPal Debit Card purchase

Here's your receipt for your PayPal Debit Card purchase
You used your PayPal Debit Mastercard at MEIJER STORE #104 on May 28, 2026.
Payment Details
*Transaction ID*
0N312199M6088954U
<https://www.paypal.com/myaccount/transaction/details/0N312199M6088954U?v=1>
*Transaction
date*
May 28, 2026
Transaction type: Purchase
Merchant: MEIJER STORE #104
Final transaction amount $56.61 USD
Total amount $56.61 USD
Available PayPal balance $286.53 USD`;

test('parses a forwarded receipt (asterisks + newline-split label)', () => {
  const txn = parsePaypalEmail('Fwd: Receipt for your PayPal Debit Card purchase', FORWARDED_BODY);
  assert.ok(txn, 'expected a parsed transaction');
  assert.equal(txn.transactionId, '0N312199M6088954U');
  assert.equal(txn.merchant, 'MEIJER STORE #104');
  assert.equal(txn.date, '2026-05-28');
  assert.equal(txn.amount, -56.61);
  assert.equal(txn.type, 'Purchase');
});

test('returns null for a non-PayPal-debit email', () => {
  assert.equal(parsePaypalEmail('Your Amazon order shipped', 'Tracking number 12345'), null);
});

test('returns null when a required field is missing', () => {
  const body = SAMPLE_BODY.replace('Final transaction amount\t$56.61 USD', '').replace('Total amount\t$56.61 USD', '');
  assert.equal(parsePaypalEmail(SAMPLE_SUBJECT, body), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePaypalEmail } from './paypal';

const SAMPLE_SUBJECT = "Here's your receipt for your PayPal Debit Card purchase";
const SAMPLE_BODY = `Here's your receipt for your PayPal Debit Card purchase
You used your PayPal Debit Mastercard at EXAMPLE STORE #001 on January 15, 2026.
Payment Details
Transaction ID
1AB23456CD789012E\tTransaction date
January 15, 2026
Transaction type:\tPurchase
Merchant:\tEXAMPLE STORE #001
PayPal Rewards
Congrats! You earned 100 points on this purchase.
Terms apply.
Final transaction amount\t$12.34 USD
Total amount\t$12.34 USD
Available PayPal balance\t$100.00 USD`;

test('parses a standard PayPal Debit Card purchase receipt', () => {
  const txn = parsePaypalEmail(SAMPLE_SUBJECT, SAMPLE_BODY);
  assert.ok(txn, 'expected a parsed transaction');
  assert.equal(txn.transactionId, '1AB23456CD789012E');
  assert.equal(txn.merchant, 'EXAMPLE STORE #001');
  assert.equal(txn.date, '2026-01-15');
  assert.equal(txn.amount, -12.34); // purchase = outflow
  assert.equal(txn.type, 'Purchase');
});

test('treats a refund as an inflow (positive amount)', () => {
  const body = SAMPLE_BODY.replace('Transaction type:\tPurchase', 'Transaction type:\tRefund');
  const txn = parsePaypalEmail('Your PayPal Debit Card refund', body);
  assert.ok(txn);
  assert.equal(txn.amount, 12.34);
  assert.equal(txn.type, 'Refund');
});

test('parses amounts with thousands separators', () => {
  const body = SAMPLE_BODY.replace('Final transaction amount\t$12.34 USD', 'Final transaction amount\t$1,234.56 USD');
  const txn = parsePaypalEmail(SAMPLE_SUBJECT, body);
  assert.ok(txn);
  assert.equal(txn.amount, -1234.56);
});

test('falls back to the summary-line date when no explicit Transaction date', () => {
  const body = SAMPLE_BODY.replace('1AB23456CD789012E\tTransaction date\nJanuary 15, 2026\n', '1AB23456CD789012E\n');
  const txn = parsePaypalEmail(SAMPLE_SUBJECT, body);
  assert.ok(txn);
  assert.equal(txn.date, '2026-01-15'); // from "...on January 15, 2026."
});

// Synthetic Gmail plain-text rendering of a *manually forwarded* receipt: markdown
// emphasis asterisks around labels/values, and the "Transaction date" label
// broken across a newline.
const FORWARDED_BODY = `---------- Forwarded message ---------
From: service@paypal.com <service@paypal.com>
Subject: Receipt for your PayPal Debit Card purchase

Here's your receipt for your PayPal Debit Card purchase
You used your PayPal Debit Mastercard at EXAMPLE STORE #001 on January 15, 2026.
Payment Details
*Transaction ID*
1AB23456CD789012E
<https://www.paypal.com/myaccount/transaction/details/1AB23456CD789012E?v=1>
*Transaction
date*
January 15, 2026
Transaction type: Purchase
Merchant: EXAMPLE STORE #001
Final transaction amount $12.34 USD
Total amount $12.34 USD
Available PayPal balance $100.00 USD`;

test('parses a forwarded receipt (asterisks + newline-split label)', () => {
  const txn = parsePaypalEmail('Fwd: Receipt for your PayPal Debit Card purchase', FORWARDED_BODY);
  assert.ok(txn, 'expected a parsed transaction');
  assert.equal(txn.transactionId, '1AB23456CD789012E');
  assert.equal(txn.merchant, 'EXAMPLE STORE #001');
  assert.equal(txn.date, '2026-01-15');
  assert.equal(txn.amount, -12.34);
  assert.equal(txn.type, 'Purchase');
});

test('returns null for a non-PayPal-debit email', () => {
  assert.equal(parsePaypalEmail('Your Amazon order shipped', 'Tracking number 12345'), null);
});

test('returns null when a required field is missing', () => {
  const body = SAMPLE_BODY.replace('Final transaction amount\t$12.34 USD', '').replace('Total amount\t$12.34 USD', '');
  assert.equal(parsePaypalEmail(SAMPLE_SUBJECT, body), null);
});

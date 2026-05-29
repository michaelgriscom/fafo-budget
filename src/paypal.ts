/**
 * Parser for PayPal Debit Card purchase receipt emails.
 *
 * PayPal sends an email receipt for every debit-card transaction. Those purchases
 * never reach Actual via bank sync (SimpleFin does not support PayPal), so we parse
 * the receipt and import it directly. The parser is intentionally pure (no I/O) so it
 * can be unit-tested against captured email bodies.
 */

export interface ParsedPaypalTxn {
  /** PayPal transaction ID — used as Actual's imported_id for dedup. */
  transactionId: string;
  /** Merchant name, used as the payee. */
  merchant: string;
  /** Transaction date in YYYY-MM-DD. */
  date: string;
  /** Signed amount in dollars. Negative = outflow (purchase), positive = inflow (refund). */
  amount: number;
  /** Raw transaction type from the email, e.g. "Purchase" or "Refund". */
  type: string;
}

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
};

/** Transaction types that represent money coming back to the account (positive amount). */
const INFLOW_TYPE = /refund|return|credit|reversal/i;

/** Parse a date like "May 28, 2026" into "2026-05-28". Returns null if unrecognized. */
function parseDate(raw: string): string | null {
  const m = raw.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  const day = m[2].padStart(2, '0');
  return `${m[3]}-${month}-${day}`;
}

/** Extract the first capture group of `re` from `text`, trimmed; null if no match. */
function extract(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Parse a PayPal Debit Card receipt. Returns null if the email is not a recognizable
 * debit-card receipt or a required field is missing — callers skip those silently.
 */
export function parsePaypalEmail(subject: string, text: string): ParsedPaypalTxn | null {
  const haystack = `${subject}\n${text}`;
  // Only act on PayPal Debit Card receipts; ignore anything else (statements, promos, etc.).
  if (!/PayPal Debit (Card|Mastercard)/i.test(haystack)) {
    return null;
  }

  const transactionId = extract(text, /Transaction ID[\s:]*([A-Z0-9]{10,})/i);
  const merchant = extract(text, /Merchant:?[ \t]*([^\n\r]+)/i);
  // Prefer the "Final transaction amount"; fall back to "Total amount".
  const amountStr =
    extract(text, /Final transaction amount[\s:]*\$?\s*([\d,]+\.\d{2})/i) ??
    extract(text, /Total amount[\s:]*\$?\s*([\d,]+\.\d{2})/i);
  // Prefer the explicit "Transaction date"; fall back to the date in the summary line.
  const dateRaw =
    extract(text, /Transaction date[\s:]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i) ??
    extract(text, /\bon\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
  const type = extract(text, /Transaction type:?[ \t]*([^\n\r]+)/i) ?? 'Purchase';

  if (!transactionId || !merchant || !amountStr || !dateRaw) {
    return null;
  }

  const date = parseDate(dateRaw);
  if (!date) return null;

  const magnitude = parseFloat(amountStr.replace(/,/g, ''));
  if (isNaN(magnitude)) return null;
  const amount = INFLOW_TYPE.test(type) ? magnitude : -magnitude;

  return { transactionId, merchant, date, amount, type };
}

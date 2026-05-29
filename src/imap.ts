import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { PaypalConfig } from './config';
import { ParsedPaypalTxn, parsePaypalEmail } from './paypal';
import { logger } from './logger';

export interface PaypalPollResult {
  found: number; // candidate messages matching the sender filter
  imported: number; // transactions handed to importFn
  skipped: number; // messages that did not parse into a transaction
}

/**
 * Connect to the dedicated PayPal inbox, parse unseen receipts, hand the parsed
 * transactions to `importFn`, and only mark the messages \Seen once importFn
 * succeeds. The IMAP connection lifecycle stays entirely inside this function;
 * `importFn` owns the Actual side (and any locking around it).
 *
 * If `importFn` throws, the messages are left unseen so the next poll retries them
 * (importTransactions dedupes on imported_id, so retries are safe).
 */
export async function processPaypalInbox(
  cfg: PaypalConfig,
  importFn: (txns: ParsedPaypalTxn[]) => Promise<void>,
): Promise<PaypalPollResult> {
  const client = new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: true,
    auth: { user: cfg.imapUser, pass: cfg.imapPassword },
    logger: false,
  });

  await client.connect();
  const result: PaypalPollResult = { found: 0, imported: 0, skipped: 0 };
  const lock = await client.getMailboxLock(cfg.mailbox);
  try {
    const candidates: { uid: number; txn: ParsedPaypalTxn }[] = [];

    // Server-side filter: only fetch unread messages whose subject matches, so we
    // don't pull the whole mailbox. The subject survives manual forwarding (it
    // just gains a "Fwd:" prefix), unlike the From header which gets rewritten.
    const query: Record<string, unknown> = { seen: false };
    if (cfg.subjectFilter) query.subject = cfg.subjectFilter;

    for await (const msg of client.fetch(query, { uid: true, source: true })) {
      const parsed = await simpleParser(msg.source as Buffer);
      const from = parsed.from?.text ?? '';
      // Optional extra From check (off by default; forwarded mail rewrites From).
      if (cfg.fromFilter && !from.toLowerCase().includes(cfg.fromFilter.toLowerCase())) {
        continue;
      }
      result.found++;
      const txn = parsePaypalEmail(parsed.subject ?? '', parsed.text ?? '');
      if (!txn) {
        result.skipped++;
        logger.warn('Skipping unparseable PayPal email', { subject: parsed.subject, uid: msg.uid });
        continue;
      }
      candidates.push({ uid: msg.uid, txn });
    }

    if (candidates.length > 0) {
      await importFn(candidates.map((c) => c.txn));
      result.imported = candidates.length;
      const uids = candidates.map((c) => c.uid).join(',');
      await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return result;
}

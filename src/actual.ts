import * as fs from 'fs';
import * as api from '@actual-app/api';
import { logger } from './logger';
import { Config } from './config';
import { ParsedPaypalTxn } from './paypal';

const DATA_DIR = '/tmp/actual-data';

export async function connect(config: Config): Promise<void> {
  logger.info('Connecting to Actual Budget server', { url: config.actual.serverUrl });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  await api.init({
    dataDir: DATA_DIR,
    serverURL: config.actual.serverUrl,
    password: config.actual.password,
  });
  await api.downloadBudget(config.actual.syncId);
  logger.info('Connected and budget downloaded');
}

export async function sync(): Promise<void> {
  await api.sync();
}

export async function runBankSync(): Promise<void> {
  logger.info('Running bank sync for all linked accounts');
  await api.runBankSync();
  logger.info('Bank sync complete');
}

export interface PaypalImportResult {
  added: number;
  updated: number;
}

/**
 * Import parsed PayPal transactions into the named Actual account. Uses
 * importTransactions, which dedupes on imported_id (the PayPal transaction ID) and
 * runs the budget's payee/category rules. Requires a prior connect().
 */
export async function importPaypalTransactions(
  accountName: string,
  txns: ParsedPaypalTxn[],
): Promise<PaypalImportResult> {
  const accounts = await api.getAccounts();
  const account = accounts.find((a) => a.name === accountName);
  if (!account) {
    throw new Error(
      `Actual account "${accountName}" not found. Create it in Actual or set PAYPAL_ACTUAL_ACCOUNT.`,
    );
  }

  const mapped = txns.map((t) => ({
    account: account.id,
    date: t.date,
    amount: api.utils.amountToInteger(t.amount),
    payee_name: t.merchant,
    imported_payee: t.merchant,
    imported_id: t.transactionId,
    cleared: true,
    notes: `PayPal debit · ${t.type}`,
  }));

  const result = await api.importTransactions(account.id, mapped);
  if (result.errors && result.errors.length > 0) {
    logger.warn('importTransactions reported errors', {
      errors: result.errors.map((e: { message: string }) => e.message),
    });
  }
  return { added: result.added.length, updated: result.updated.length };
}

export async function disconnect(): Promise<void> {
  try {
    await api.shutdown();
  } catch {
    // shutdown may fail if never connected
  }
}

export { api };

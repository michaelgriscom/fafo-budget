import http from 'node:http';
import cron from 'node-cron';
import { loadConfig, Config } from './config';
import { connect, disconnect, runBankSync, sync, importPaypalTransactions } from './actual';
import { processPaypalInbox } from './imap';
import { reconcile } from './reconcile';
import { logger } from './logger';
import {
  getSyncState,
  setSyncSuccess,
  setSyncError,
  setSyncDisabled,
  getPaypalState,
  setPaypalSuccess,
  setPaypalError,
  setPaypalDisabled,
} from './syncStatus';

// The @actual-app/api client is a process-wide singleton, so the monthly
// reconciliation and the PayPal poller must never drive it concurrently. This
// promise chain serializes all Actual sessions.
let actualLock: Promise<unknown> = Promise.resolve();
function withActualLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = actualLock.then(fn, fn);
  actualLock = run.catch(() => {});
  return run;
}

async function runScheduledJob(): Promise<void> {
  const config = loadConfig();
  await withActualLock(async () => {
    try {
      await connect(config);

      if (config.fafo.bankSync) {
        try {
          await runBankSync();
          setSyncSuccess();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setSyncError(message);
          throw err;
        }
      } else {
        setSyncDisabled();
      }

      await reconcile(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Scheduled job failed', { error: message });
    } finally {
      await disconnect();
    }
  });
}

async function runPaypalPoll(config: Config): Promise<void> {
  if (!config.paypal) return;
  const paypal = config.paypal;
  try {
    const result = await processPaypalInbox(paypal, async (txns) => {
      await withActualLock(async () => {
        await connect(config);
        try {
          const imported = await importPaypalTransactions(paypal.actualAccount, txns);
          await sync();
          logger.info('Imported PayPal transactions', {
            account: paypal.actualAccount,
            ...imported,
          });
        } finally {
          await disconnect();
        }
      });
    });
    if (result.found > 0 || result.imported > 0) {
      logger.info('PayPal poll complete', { ...result });
    }
    setPaypalSuccess(result.imported);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('PayPal poll failed', { error: message });
    setPaypalError(message);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const [hours, minutes] = config.fafo.reconTime.split(':');
  const cronExpr = `${minutes} ${hours} * * *`;

  logger.info('FAFO Budget Reconciler starting', {
    reconStartDay: config.fafo.reconStartDay,
    reconEndDay: config.fafo.reconEndDay,
    reconTime: config.fafo.reconTime,
    cronExpr,
    dryRun: config.fafo.dryRun,
    monthlyTarget: config.fafo.monthlyTarget,
    bankSync: config.fafo.bankSync,
    inflation: config.fafo.inflation
      ? {
          budgetStartDate: config.fafo.inflation.budgetStartDate,
          baseAllowances: config.fafo.inflation.baseAllowances,
        }
      : false,
  });

  // Schedule daily
  cron.schedule(cronExpr, () => {
    runScheduledJob();
  });

  logger.info(`Scheduler active — next run at ${config.fafo.reconTime} daily`);

  // PayPal email import: poll the dedicated inbox on its own schedule
  if (config.paypal) {
    logger.info('PayPal email import enabled', {
      mailbox: config.paypal.mailbox,
      account: config.paypal.actualAccount,
      pollCron: config.paypal.pollCron,
    });
    await runPaypalPoll(config);
    cron.schedule(config.paypal.pollCron, () => {
      runPaypalPoll(config);
    });
  } else {
    setPaypalDisabled();
  }

  // HTTP endpoints for monitoring (e.g. Uptime Kuma)
  const server = http.createServer((_req, res) => {
    if (_req.url === '/sync') {
      const state = getSyncState();
      const statusCode = state.status === 'error' ? 500 : 200;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state));
      return;
    }
    if (_req.url === '/paypal') {
      const state = getPaypalState();
      const statusCode = state.status === 'error' ? 500 : 200;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  });
  server.listen(config.fafo.healthPort, () => {
    logger.info(`Health check listening on port ${config.fafo.healthPort}`);
  });
}

// The @actual-app/api client can throw asynchronously from its internal sync
// (e.g. a failed bank sync) after the awaited call has already rejected. Those
// escape the try/catch in runScheduledJob, so without these handlers Node would
// crash the whole process. Log and keep the daemon alive instead.
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logger.error('Unhandled promise rejection (ignored, daemon continues)', { error: message });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception (ignored, daemon continues)', {
    error: err instanceof Error ? err.message : String(err),
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down');
  await disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down');
  await disconnect();
  process.exit(0);
});

main().catch((err) => {
  logger.error('Fatal error', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

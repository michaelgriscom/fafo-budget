import http from 'node:http';
import cron from 'node-cron';
import { loadConfig } from './config';
import { connect, disconnect, runBankSync } from './actual';
import { reconcile } from './reconcile';
import { logger } from './logger';
import { getSyncState, setSyncSuccess, setSyncError, setSyncDisabled } from './syncStatus';

async function runScheduledJob(): Promise<void> {
  const config = loadConfig();
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

  // Run once on startup
  await runScheduledJob();

  // Schedule daily
  cron.schedule(cronExpr, () => {
    runScheduledJob();
  });

  logger.info(`Scheduler active — next run at ${config.fafo.reconTime} daily`);

  // HTTP endpoints for monitoring (e.g. Uptime Kuma)
  const server = http.createServer((_req, res) => {
    if (_req.url === '/sync') {
      const state = getSyncState();
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

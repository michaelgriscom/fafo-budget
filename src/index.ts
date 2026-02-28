import http from 'node:http';
import cron from 'node-cron';
import { loadConfig } from './config';
import { connect, disconnect, runBankSync } from './actual';
import { reconcile } from './reconcile';
import { logger } from './logger';

async function runScheduledJob(): Promise<void> {
  const config = loadConfig();
  try {
    await connect(config);

    if (config.fafo.bankSync) {
      await runBankSync();
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
  });

  // Run once on startup
  await runScheduledJob();

  // Schedule daily
  cron.schedule(cronExpr, () => {
    runScheduledJob();
  });

  logger.info(`Scheduler active — next run at ${config.fafo.reconTime} daily`);

  // Health check endpoint for monitoring (e.g. Uptime Kuma)
  const server = http.createServer((_req, res) => {
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

import * as fs from 'fs';
import * as api from '@actual-app/api';
import { logger } from './logger';
import { Config } from './config';

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

export async function disconnect(): Promise<void> {
  try {
    await api.shutdown();
  } catch {
    // shutdown may fail if never connected
  }
}

export { api };

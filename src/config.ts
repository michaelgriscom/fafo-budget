export interface Config {
  actual: {
    serverUrl: string;
    password: string;
    syncId: string;
  };
  fafo: {
    monthlyTarget: number;
    reconStartDay: number;
    reconEndDay: number;
    reconTime: string;
    otherCategory: string | null;
    dryRun: boolean;
    healthPort: number;
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer for ${name}: ${value}`);
  }
  return parsed;
}

export function loadConfig(): Config {
  const reconStartDay = optionalInt('FAFO_RECON_START_DAY', 28);
  const reconEndDay = optionalInt('FAFO_RECON_END_DAY', 5);
  const reconTime = process.env['FAFO_RECON_TIME'] || '02:00';

  if (reconStartDay < 1 || reconStartDay > 31) {
    throw new Error(`FAFO_RECON_START_DAY must be 1-31, got ${reconStartDay}`);
  }
  if (reconEndDay < 1 || reconEndDay > 28) {
    throw new Error(`FAFO_RECON_END_DAY must be 1-28, got ${reconEndDay}`);
  }
  if (!/^\d{2}:\d{2}$/.test(reconTime)) {
    throw new Error(`FAFO_RECON_TIME must be HH:MM format, got ${reconTime}`);
  }

  const targetStr = required('FAFO_MONTHLY_TARGET');
  const monthlyTarget = parseFloat(targetStr);
  if (isNaN(monthlyTarget) || monthlyTarget <= 0) {
    throw new Error(`FAFO_MONTHLY_TARGET must be a positive number, got ${targetStr}`);
  }

  return {
    actual: {
      serverUrl: required('ACTUAL_SERVER_URL'),
      password: required('ACTUAL_SERVER_PASSWORD'),
      syncId: required('ACTUAL_SYNC_ID'),
    },
    fafo: {
      monthlyTarget,
      reconStartDay,
      reconEndDay,
      reconTime,
      otherCategory: process.env['FAFO_OTHER_CATEGORY'] || null,
      dryRun: process.env['FAFO_DRY_RUN'] === 'true',
      healthPort: optionalInt('FAFO_HEALTH_PORT', 8080),
    },
  };
}

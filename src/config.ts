export interface InflationConfig {
  fredApiKey: string;
  budgetStartDate: string; // YYYY-MM-DD
  baseAllowances: Record<string, number>; // lowercase category name -> dollars (may be empty)
}

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
    bankSync: boolean;
    inflation: InflationConfig | null;
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

  // Parse optional inflation config
  let inflation: InflationConfig | null = null;
  const fredApiKey = process.env['FRED_API_KEY'];
  if (fredApiKey) {
    const budgetStartDate = required('BUDGET_START_DATE');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(budgetStartDate)) {
      throw new Error(`BUDGET_START_DATE must be YYYY-MM-DD format, got ${budgetStartDate}`);
    }

    const baseAllowances: Record<string, number> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('BASE_ALLOWANCE_') && value) {
        const name = key.slice('BASE_ALLOWANCE_'.length).toLowerCase();
        const amount = parseFloat(value);
        if (isNaN(amount) || amount <= 0) {
          throw new Error(`${key} must be a positive number, got ${value}`);
        }
        baseAllowances[name] = amount;
      }
    }

    inflation = { fredApiKey, budgetStartDate, baseAllowances };
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
      bankSync: process.env['FAFO_BANK_SYNC'] === 'true',
      inflation,
    },
  };
}

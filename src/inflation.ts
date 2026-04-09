import { logger } from './logger';

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations: FredObservation[];
}

export interface InflationResult {
  startPcepi: number;
  latestPcepi: number;
  cumulativeChange: number;
}

async function fetchFredObservation(
  apiKey: string,
  params: Record<string, string>,
): Promise<number | null> {
  const url = new URL('https://api.stlouisfed.org/fred/series/observations');
  url.searchParams.set('series_id', 'PCEPI');
  url.searchParams.set('units', 'lin');
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`FRED API returned ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as FredResponse;
  if (!data.observations || data.observations.length === 0) {
    return null;
  }

  const value = data.observations[0].value;
  if (value === '.') {
    return null; // FRED uses "." for missing data
  }

  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    throw new Error(`Invalid PCEPI value from FRED: "${value}"`);
  }

  return parsed;
}

/**
 * Fetch PCE Price Index data from FRED and compute cumulative inflation
 * since the budget start date.
 *
 * Returns null (and logs a warning) if the API is unreachable or returns
 * no usable data — the caller should fall back to base values.
 */
export async function fetchInflation(
  fredApiKey: string,
  budgetStartDate: string,
): Promise<InflationResult | null> {
  try {
    // Fetch start PCEPI: most recent observation at or before the start date.
    // Using observation_end + sort_order=desc handles the edge case where
    // the exact start date has no observation (uses nearest prior month).
    const startPcepi = await fetchFredObservation(fredApiKey, {
      observation_end: budgetStartDate,
      sort_order: 'desc',
      limit: '1',
    });

    // Fetch latest PCEPI: most recent observation from start date onwards.
    const latestPcepi = await fetchFredObservation(fredApiKey, {
      observation_start: budgetStartDate,
      sort_order: 'desc',
      limit: '1',
    });

    if (startPcepi === null || latestPcepi === null) {
      logger.warn('FRED API returned no PCEPI observations, skipping inflation adjustment');
      return null;
    }

    const cumulativeChange = (latestPcepi / startPcepi) - 1;

    return { startPcepi, latestPcepi, cumulativeChange };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('FRED API request failed, skipping inflation adjustment', { error: message });
    return null;
  }
}

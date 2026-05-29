import { logger } from './logger';

interface FREDObservation {
  date: string;
  value: string;
}

interface FREDResponse {
  observations?: FREDObservation[];
}

export interface InflationAdjustment {
  startPcepi: number;
  latestPcepi: number;
  cumulativeChange: number; // e.g. 0.03 for 3% inflation
}

async function fetchFredObservation(
  fredApiKey: string,
  params: Record<string, string>,
): Promise<number | null> {
  const url = new URL('https://api.stlouisfed.org/fred/series/observations');
  url.searchParams.set('series_id', 'PCEPI');
  url.searchParams.set('units', 'lin');
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('api_key', fredApiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`FRED API returned ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as FREDResponse;
  if (!data.observations?.length) return null;

  const value = parseFloat(data.observations[0].value);
  return isNaN(value) ? null : value;
}

export async function getInflationAdjustment(
  fredApiKey: string,
  budgetStartDate: string,
): Promise<InflationAdjustment | null> {
  try {
    // Get the PCEPI value at or just before the budget start date.
    // PCEPI is released monthly (dated 1st of month). Using observation_end
    // with sort_order=desc handles the case where the start date doesn't
    // land exactly on a release date.
    const startPcepi = await fetchFredObservation(fredApiKey, {
      observation_end: budgetStartDate,
      sort_order: 'desc',
      limit: '1',
    });

    if (startPcepi === null) {
      logger.warn('Could not retrieve start PCEPI value from FRED');
      return null;
    }

    // Get the most recent PCEPI value from the start date onwards
    const latestPcepi = await fetchFredObservation(fredApiKey, {
      observation_start: budgetStartDate,
      sort_order: 'desc',
      limit: '1',
    });

    if (latestPcepi === null) {
      logger.warn('Could not retrieve latest PCEPI value from FRED');
      return null;
    }

    const cumulativeChange = latestPcepi / startPcepi - 1;

    return { startPcepi, latestPcepi, cumulativeChange };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('Failed to fetch PCE inflation data, skipping adjustment', {
      error: message,
    });
    return null;
  }
}

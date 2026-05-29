# fafo-budget

Automated [FAFO budget](https://michaelgris.com/posts/fafo-budget/) reconciliation for [Actual Budget](https://actualbudget.org/).

## What it does

Each month, the FAFO system requires reconciliation:

1. **Flex** budgets for the prior month are corrected to match actual spending
2. **Fixed**, **Flex**, and **Allowances** budgets are copied to the new month
3. **Other** is calculated as `Target - Fixed - Flex - Allowances` for the new month

This container automates the reconciliation, running daily during a configurable window around month-end. As late transactions land, each run re-corrects the numbers.

## Requirements

Your Actual Budget categories must be organized into four category groups:

- **Fixed** — Known expenses with predictable amounts
- **Allowances** — Personal spending accounts
- **Flex** — Expected but variable expenses
- **Other** — Catch-all (the calculated remainder goes to the first category in this group)

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `ACTUAL_SERVER_URL` | Yes | — | Actual Budget server URL |
| `ACTUAL_SERVER_PASSWORD` | Yes | — | Server password |
| `ACTUAL_SYNC_ID` | Yes | — | Budget sync ID |
| `FAFO_MONTHLY_TARGET` | Yes | — | Monthly spending target in dollars |
| `FAFO_RECON_START_DAY` | No | `28` | Day of month to start reconciliation |
| `FAFO_RECON_END_DAY` | No | `5` | Day of next month to stop reconciliation |
| `FAFO_RECON_TIME` | No | `02:00` | Time of day to run (HH:MM, 24hr) |
| `TZ` | No | `UTC` | Timezone |
| `FAFO_OTHER_CATEGORY` | No | *(first in group)* | Name of the catch-all category in the Other group |
| `FAFO_BANK_SYNC` | No | `false` | Sync linked bank accounts before reconciliation |
| `FAFO_DRY_RUN` | No | `false` | Log changes without applying them |
| `FAFO_HEALTH_PORT` | No | `8080` | Port for the health check HTTP endpoint |

## How the reconciliation window works

With default settings (`start=28`, `end=5`):

- **Jan 28–Feb 5**: Corrects January's Flex budgets to match actual spending and updates Other per the aforementioned calculation. Copies the budget values over to February. The runs in February are intended to catch end-of-month transactions that take additional days to clear.
- **Feb 6–27**: No reconciliation (outside window)
- **Feb 28–Mar 5**: Same process for February → March

## Inflation adjustment

Without inflation adjustment, rising prices silently eat into the Other category's budget, creating negative carryover that's indistinguishable from actual overspending. This corrupts the FAFO signal.

When `FRED_API_KEY` and `BUDGET_START_DATE` are set, the reconciler automatically adjusts `FAFO_MONTHLY_TARGET` (and optionally allowance budgets) for cumulative inflation since the budget start date using the [PCE Price Index](https://fred.stlouisfed.org/series/PCEPI) from the Federal Reserve (FRED).

PCE is used instead of CPI because it accounts for substitution effects — when one good gets expensive, consumers shift spending to alternatives. CPI assumes a fixed basket, which tends to overstate inflation as experienced by households. This makes PCE a better fit for adjusting a real spending budget.

| Variable | Required | Default | Description |
|---|---|---|---|
| `FRED_API_KEY` | No | — | Enables inflation adjustment ([request one here](https://fred.stlouisfed.org/docs/api/api_key.html)) |
| `BUDGET_START_DATE` | When `FRED_API_KEY` set | — | Month the baseline was set (YYYY-MM-DD) |
| `BASE_ALLOWANCE_*` | No | — | Base allowance per member (e.g. `BASE_ALLOWANCE_ALICE=200`) |

If the FRED API is unavailable, the reconciler logs a warning and uses unadjusted base values.

## Docker Compose

```yaml
fafo_budget:
  container_name: fafo_budget
  image: ghcr.io/michaelgriscom/fafo-budget:latest
  restart: unless-stopped
  depends_on:
    actual_budget:
      condition: service_healthy
  environment:
    - TZ=America/New_York
    - NODE_TLS_REJECT_UNAUTHORIZED=0
    - ACTUAL_SERVER_URL=https://budget.example.com
    - ACTUAL_SERVER_PASSWORD=your-password
    - ACTUAL_SYNC_ID=your-sync-id
    - FAFO_MONTHLY_TARGET=5000
```

## Monitoring

The container exposes two HTTP endpoints on port 8080 (configurable via `FAFO_HEALTH_PORT`):

| Endpoint | Description |
|---|---|
| `GET /` | Basic health check — always returns `200 OK` |
| `GET /sync` | Bank sync status — returns `200` with JSON state on success, `500` on sync error. Possible states: `pending`, `success`, `error`, `disabled` |

The Dockerfile includes a `HEALTHCHECK` instruction, so Docker will automatically report container health. For external monitoring (e.g. Uptime Kuma), use `/` for general uptime and `/sync` to alert on bank sync failures.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run (with .env file)
npm start

# Docker build
docker build -t fafo-budget .
docker run --env-file .env fafo-budget
```

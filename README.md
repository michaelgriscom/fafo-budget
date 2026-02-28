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
| `FAFO_DRY_RUN` | No | `false` | Log changes without applying them |
| `FAFO_HEALTH_PORT` | No | `8080` | Port for the health check HTTP endpoint |

## How the reconciliation window works

With default settings (`start=28`, `end=5`):

- **Jan 28–Feb 5**: Corrects January's Flex budgets to match actual spending, copies all budgets to February, and calculates February's Other amount. Runs daily so late-landing transactions are picked up.
- **Feb 6–27**: No reconciliation (outside window)
- **Feb 28–Mar 5**: Same process for February → March

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

The container exposes an HTTP health check endpoint on port 8080 (configurable via `FAFO_HEALTH_PORT`). Any request returns `200 OK`.

The Dockerfile includes a `HEALTHCHECK` instruction, so Docker will automatically report container health. For external monitoring (e.g. Uptime Kuma), point an HTTP monitor at `http://fafo_budget:8080`.

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

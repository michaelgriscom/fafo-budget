# fafo-budget

Automated [FAFO budget](https://michaelgris.com/posts/fafo-budget/) reconciliation for [Actual Budget](https://actualbudget.org/).

## What it does

Each month, the FAFO system requires reconciliation:

1. **Flex** budgets are set to last month's actual spending
2. **Other** is calculated as `Target - Fixed - Flex - Allowances`
3. **Fixed** and **Allowances** budgets are left as-is (set by you)

This container automates steps 1 and 2, running daily during a configurable reconciliation window around month-end.

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

## How the reconciliation window works

With default settings (`start=28`, `end=5`):

- **Jan 28–31**: Sets February budgets based on January spending so far
- **Feb 1–5**: Continues updating February budgets as remaining January transactions clear
- **Feb 6–27**: No reconciliation (outside window)
- **Feb 28**: Starts setting March budgets

Running daily within the window means budgets converge on correct values as late transactions land.

## Docker Compose

```yaml
fafo_budget:
  container_name: fafo_budget
  image: ghcr.io/yourusername/fafo-budget:latest
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

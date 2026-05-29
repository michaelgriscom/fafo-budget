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

## PayPal Debit Card import

PayPal debit card purchases don't appear in Actual via bank sync (SimpleFin doesn't
support PayPal), but PayPal can email a notification for every transaction (enable
transaction notifications in your PayPal account settings). When
`PAYPAL_IMPORT_ENABLED=true`, this container polls an IMAP mailbox for those emails
(matched by subject, so forwarded copies work too), parses them, and imports them
into an Actual account using `imported_id` dedup (the PayPal transaction ID) so
re-polling never creates duplicates. Your existing Actual payee/category rules run
automatically on import.

| Variable | Required | Default | Description |
|---|---|---|---|
| `PAYPAL_IMPORT_ENABLED` | No | `false` | Enables PayPal email import |
| `IMAP_HOST` | No | `imap.gmail.com` | IMAP server host |
| `IMAP_PORT` | No | `993` | IMAP server port (TLS) |
| `IMAP_USER` | When enabled | — | IMAP username |
| `IMAP_PASSWORD` | When enabled | — | IMAP password / app password |
| `IMAP_MAILBOX` | No | `INBOX` | Mailbox/folder to poll |
| `PAYPAL_SUBJECT` | No | `PayPal Debit Card` | Subject substring matched by the server-side IMAP search |
| `PAYPAL_FROM` | No | _(unset)_ | Optional sender substring filter, for extra security |
| `PAYPAL_ACTUAL_ACCOUNT` | No | `PayPal` | Exact name of the Actual account to import into |
| `PAYPAL_POLL_CRON` | No | `0 */6 * * *` | Cron schedule for polling |

**Prerequisite:** create an account in Actual whose name exactly matches
`PAYPAL_ACTUAL_ACCOUNT`. Only "Purchase"-type receipts import as outflows; refunds
are detected and imported as inflows. Emails that can't be confidently parsed are
left unread and logged.

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
| `GET /paypal` | PayPal import status — returns `200` with JSON state (`success` includes the last `imported` count), `500` on poll error. Possible states: `pending`, `success`, `error`, `disabled` |

The Dockerfile includes a `HEALTHCHECK` instruction, so Docker reports container health automatically. The endpoints above can be wired into external monitoring (e.g. Uptime Kuma).

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

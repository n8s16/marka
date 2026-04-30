# Marka — Data Model

The full data model for Marka. Six entities — three reference, three event. All event entities are derivation-friendly: balances and totals are computed from sums of events, never stored as fields (with one explicit exception: `opening_balance` on Wallet).

## Storage rules (apply to every entity)

- **IDs**: UUID v4, generated client-side, stored as strings. Never auto-incrementing integers.
- **Currency**: integer minor units (centavos). PHP has 100 centavos to a peso. ₱1,599.00 is stored as `159900`. NEVER decimals or floats.
- **Dates**: ISO 8601 strings. Date-only fields use `YYYY-MM-DD`. Timestamps use full ISO. All date math goes through date-fns.
- **Periods**: stored as `YYYY-MM` strings (e.g. `"2026-04"`). Always represents the due-month or coverage-month, not the paid date.
- **Timestamps**: every table has `created_at` and `updated_at`, full ISO format, managed automatically.
- **Soft delete**: `archived` boolean flag, defaults `false`. Records are never silently removed. Hard delete is an explicit, confirmed user action that cascades.
- **Naming**: `snake_case` columns and table names. Singular table names (`wallet`, not `wallets`).

## Reference entities

### Wallet

Represents a source account — Maya, GCash, UnionBank, Cash, etc.

| field | type | notes |
|---|---|---|
| `id` | uuid | primary key |
| `name` | text | display name, e.g. "Maya" |
| `color` | text | hex with #, e.g. `#00B14F` |
| `icon` | text | optional icon identifier |
| `type` | enum | `e_wallet` \| `bank` \| `cash` |
| `show_balance` | boolean | default `false` |
| `opening_balance` | integer (centavos) | nullable, only set when show_balance is true |
| `archived` | boolean | default `false` |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

`opening_balance` is the one intentional state field in the system. It's a snapshot taken when the user enables `show_balance` for a wallet, computed by working backward from their reported current balance: `opening_balance = current_balance + sum_of_recorded_outflows - sum_of_recorded_inflows`.

`type` does not include `credit_card` in v1. Adding it later requires explicit modelling of statement-based behavior.

### Bill

Represents a recurring obligation — utilities, internet, subscriptions, MP2 contributions, insurance.

| field | type | notes |
|---|---|---|
| `id` | uuid | primary key |
| `name` | text | display name |
| `expected_amount` | integer (centavos) | the forecast value used until actuals exist |
| `frequency` | enum | `monthly` \| `quarterly` \| `yearly` \| `custom` |
| `interval_months` | integer | nullable; required when `frequency = custom` (e.g. `2` for bi-monthly). Null for monthly/quarterly/yearly. |
| `due_day` | integer | 1–31. Clamps to the last day of the month when the month has fewer days (a bill with `due_day = 31` resolves to Feb 28/29, Apr 30, etc.). |
| `start_period` | text | `YYYY-MM`. The first due-month for this bill. Anchors quarterly/yearly/custom cadences; defaults to the bill's creation month for monthly. |
| `default_wallet_id` | uuid | foreign key to Wallet |
| `reminder_offset_days` | integer | e.g. `3` for "3 days before due" |
| `reminder_time` | text | time-of-day, e.g. `"08:00"` |
| `auto_forecast` | boolean | if true, future periods use the rolling average of the last 3 actuals (regardless of cadence); if false, use `expected_amount` |
| `archived` | boolean | default `false` |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

`start_period` anchors the bill's due-month sequence. For `monthly`, every month from `start_period` onward is a due-month. For `quarterly`, due-months are every 3 months from `start_period` (e.g. `2026-03` → Mar/Jun/Sep/Dec each year). For `yearly`, the same month each year from `start_period`. For `custom`, every `interval_months` months from `start_period`.

Within a due-month, the actual due-date is that period's year and month combined with `due_day`, clamped to the last day of the month when the month has fewer days. A period earlier than `start_period` is never a due-period for the bill, even if frequency would otherwise suggest it; the year grid renders em-dash for non-due periods.

### Category

For one-off expense classification.

| field | type | notes |
|---|---|---|
| `id` | uuid | primary key |
| `name` | text | display name |
| `icon` | text | optional icon identifier |
| `archived` | boolean | default `false` |
| `sort_order` | integer | controls list ordering |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

Seeded on first run with eight starter categories: Food, Transport, Shopping, Tech, Health, Entertainment, Personal, Misc.

## Event entities

### BillPayment

The event of marking a bill paid for a period.

| field | type | notes |
|---|---|---|
| `id` | uuid | primary key |
| `bill_id` | uuid | foreign key to Bill |
| `wallet_id` | uuid | foreign key to Wallet |
| `amount` | integer (centavos) | actual paid amount, may differ from bill's `expected_amount` |
| `paid_date` | date | when the payment happened by clock |
| `period` | text | which period it covers, e.g. `"2026-04"` |
| `note` | text | optional |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**Constraint**: `(bill_id, period)` is unique. Attempting to insert a second payment for the same bill+period must be caught and surfaced to the user as an overwrite-or-change-period dialog.

The `period` field is what determines bill-status calculations and year-grid placement, not `paid_date`. A bill paid May 2nd for April's period satisfies April's row.

### Expense

A one-off, non-bill purchase.

| field | type | notes |
|---|---|---|
| `id` | uuid | primary key |
| `description` | text | free-text label |
| `amount` | integer (centavos) | nullable (some entries are amount-less placeholders) |
| `category_id` | uuid | foreign key to Category |
| `wallet_id` | uuid | foreign key to Wallet |
| `date` | date | when the expense occurred |
| `note` | text | optional |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### Transfer

Moving money between two wallets. NOT spending.

| field | type | notes |
|---|---|---|
| `id` | uuid | primary key |
| `from_wallet_id` | uuid | foreign key to Wallet |
| `to_wallet_id` | uuid | foreign key to Wallet |
| `amount` | integer (centavos) | |
| `date` | date | |
| `note` | text | optional |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**Critical rule**: Transfers must NEVER appear in spending or outflow totals at the aggregate level. They affect per-wallet outflow and inflow individually but do not reduce net spending.

## Derived values (compute, never store)

These are calculated on the fly from event records. None of them are persisted.

### Wallet outflow this month

```
sum(BillPayment.amount where wallet_id = X and paid_date in [month_start, month_end])
+ sum(Expense.amount where wallet_id = X and date in [month_start, month_end])
+ sum(Transfer.amount where from_wallet_id = X and date in [month_start, month_end])
```

### Wallet outflow excluding transfers

For the "out this month" summary card and Insights aggregations, transfers are excluded:

```
sum(BillPayment.amount where wallet_id = X and paid_date in month)
+ sum(Expense.amount where wallet_id = X and date in month)
```

### Wallet balance (only when `show_balance` is true)

```
opening_balance
+ sum(Transfer.amount where to_wallet_id = X)
- sum(Transfer.amount where from_wallet_id = X)
- sum(BillPayment.amount where wallet_id = X)
- sum(Expense.amount where wallet_id = X)
```

When `show_balance` is false, balance is null/undefined and the UI hides the field entirely.

### Bill status for a given period

This rule assumes the period is a due-period for the bill (per the cadence rules above). For non-due periods, status is undefined and the year grid renders em-dash directly.

```
let payment = BillPayment where bill_id = X and period = P
if payment exists       → "paid" (display payment.amount, tinted with payment's wallet color, strikethrough)
elif period is in past   → "unpaid" (or "overdue" if past due_day in current month)
elif period is current   → "upcoming" (with reminder if within reminder_offset_days)
else                     → "future" (forecast value, dashed border)
```

### Forecast for a future period

```
if bill.auto_forecast is true:
  forecast = average of last 3 BillPayments for this bill, ordered by period descending
  (if fewer than 3 actuals exist, use whatever's available; if zero, fall back to expected_amount)
else:
  forecast = bill.expected_amount
```

Forecasts only populate future periods. Past periods without payments are "unpaid," not forecasts.

### Year grid cell resolution

For each (bill, period) coordinate in the grid:

```
let payment = BillPayment where bill_id = bill.id and period = period
if payment exists:
  → render payment.amount, strikethrough, tinted with payment.wallet's color
elif this period is a due-period for the bill (per the cadence rules — frequency, start_period, and interval_months):
  → render forecast value (per rule above), dashed border, no color tint
else:
  → render em-dash
```

Quarterly bills like PRU only have due-periods every 3 months from `start_period`; non-due months render as em-dash.

## Behavioral rules

These rules are enforced by the business-logic-developer subagent in `/logic` and tested by qa-tester.

- **Transfers don't reduce net spending.** Every aggregation that summarizes "spending" or "outflow excluding transfers" must explicitly filter out Transfer events.
- **Archived entities preserve history.** Querying for "all wallets" in a picker should exclude archived; querying for "all wallets including archived" should be available for resolving historical references.
- **Hard delete cascades and warns.** A separate, confirmed action distinct from archive. Cascades to dependent events. Logs a warning to the user about what's being lost.
- **Period uniqueness for BillPayment.** Enforced at the schema level (unique index on `(bill_id, period)`) and surfaced in UI as a clear conflict dialog.
- **Forecasts never overwrite actuals.** A computed forecast for a period is overridden by any BillPayment that exists for that period. The grid resolution rule above guarantees this.
- **Past period without payment stays unpaid.** Don't auto-fill historical periods with forecasts. Empty cells in the past mean "no record," not "unpaid forecast."
- **Date warnings are advisory, not blocking.** Logging a transaction more than 30 days in the past triggers a soft warning but never blocks the action.

## Indexes worth having from day one

- `BillPayment(bill_id, period)` — the unique constraint, also the most common lookup.
- `BillPayment(paid_date)` — for monthly outflow queries.
- `Expense(date)` — for the chronological log on the Spending tab.
- `Expense(wallet_id, date)` — for per-wallet outflow.
- `Transfer(from_wallet_id, date)` and `Transfer(to_wallet_id, date)` — for per-wallet movement.

Other indexes can be added when there's evidence of need, not preemptively. Database will have hundreds to low thousands of rows for years.

## Schema evolution

Every schema change requires a Drizzle migration generated via `drizzle-kit generate`. Applied migrations are immutable — fix mistakes by writing new migrations, never editing old ones.

When adding a field to support a deferred feature (e.g. partial payments later), don't add the field preemptively. Add it when the feature lands.

## Open data questions

None for v1. If implementation surfaces ambiguity, surface it through the main agent and update this document, never silently invent semantics.

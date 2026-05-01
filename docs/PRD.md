# Marka — Product Requirements

The product spec for Marka, a personal expense and bill tracker. This document is the source of truth for *what* the app is and *why*. Engineering details live in `CLAUDE.md`; data shapes and derivation rules live in `DATA_MODEL.md`.

## The user and the problem

The user is a backend developer in the Philippines who currently tracks bills in a Google Sheet — months as columns, recurring bills as rows, paid items struck through, cells colored green to indicate "paid via Maya." The sheet works for predictable bills but breaks down in two ways:

1. **One-off purchases live in a no-man's-land** at the bottom of the sheet, with inconsistent dates and amounts. Things get logged or forgotten ad hoc.
2. **The sheet is unusable on mobile**, which is exactly when most spending decisions happen.

Marka replaces this spreadsheet for personal use. Multi-user, sharing, cloud sync, and "for other people" features are explicitly out of scope for v1. The user wants to enjoy the app and find it genuinely useful before considering anything broader.

## The mental model

Marka organizes money movement into three layers, each with its own UX, because they have very different cadences and decision-making patterns:

1. **Recurring bills** — predictable, scheduled obligations (utilities, internet, insurance, MP2 contributions, subscriptions). Tracked with paid/unpaid state, due-date reminders, and a year-grid view that mirrors the user's spreadsheet.
2. **One-off spending** — unpredictable purchases (groceries, gadgets). Tracked in a chronological log with quick-add affordance.
3. **Wallets** — the source accounts (Maya, GCash, UnionBank, Cash, etc.). Every transaction is tagged to a wallet. The app tracks per-wallet outflow honestly; balance tracking is opt-in.

A fourth surface, **Insights**, derives summaries, trends, and anomalies from the above.

## Core design principles

- **Local-first.** All data lives on the device. No required cloud account, no required network. Backups are device-level (iCloud / Google Drive) plus optional manual export.
- **Outflow-primary, balance-optional.** Wallets show "out this month" by default. Balance tracking is opt-in per wallet (`show_balance` flag, plus an opening balance entered when enabled). The app never invents a balance it can't reliably know.
- **Events not states.** Wallet outflow and monthly totals are derived from transaction records, never stored as fields. Opening balance is the only intentional snapshot.
- **Archive, don't delete.** Wallets, bills, and categories use an `archived` flag. Historical transactions referencing them must continue to resolve.
- **Brand-color wallet identity.** Wallets carry a color used consistently across the app — left-accent borders on cards, dots next to transactions, tinted cells in the year grid. Color is the primary visual encoding of "where did this come from?"
- **Strikethrough for paid.** Paid bill rows visually recede with strikethrough and reduced opacity. Unpaid rows pop. Mirrors the user's spreadsheet convention.
- **Minimal onboarding.** Two-step flow: pick wallets (defaults pre-checked), add first bill (skippable). No accounts, no email, no balance prompts. Get into the app in under 30 seconds.

## Scope decisions

The following decisions are locked. Do not relitigate without explicit user approval.

### What's in v1

- **Bills** with monthly, quarterly, yearly, or custom frequency
- **Subscriptions are bills** (Spotify, Netflix, iCloud sit alongside utilities in the Bills tab)
- **One-off expenses** with category, wallet, date, optional note
- **Wallets** with brand color, type (e-wallet, bank, cash), and opt-in balance tracking
- **Transfers** between wallets (do not count as spending)
- **Year grid view** (rows × months matrix mirroring the user's spreadsheet)
- **Per-bill reminder time** (each bill has its own time-of-day for the reminder, plus the days-before-due offset)
- **Auto-cancel reminders on payment**, until the next period
- **Period field on bill payments** (defaults to the bill's due-month, user-editable)
- **Flexible date entry with a soft warning** when the date is more than 30 days in the past
- **Centavos optional in input**, two decimals always shown in display
- **Theme picker** (Light / Dark / System), defaulting to System
- **App lock** via biometrics or PIN, available in Settings, off by default
- **OS-level auto-backup** (data file in iCloud / Google Drive backup location)
- **Manual export** to JSON (full fidelity) and CSV (per-table, for spreadsheets)
- **8 starter categories**: Food, Transport, Shopping, Tech, Health, Entertainment, Personal, Misc — user-editable, archive-not-delete

### What's deliberately not in v1

- Partial bill payments and installments
- Credit card support (statement balances, carry-over, interest)
- Budgets and spending limits
- Goals (saving for trips, etc.)
- Splitting / shared wallets
- SMS parsing or receipt OCR for auto-capture
- CSV import (manual backfill only for v1)
- Multi-currency or trip mode
- Cloud sync between devices
- Receipt/photo attachments
- Tags or multi-category transactions
- Auto-lock after idle time

If any of these become necessary later, the data model is structured to allow extension without rewriting.

## Wallet brand colors

The starter wallets and their brand colors:

- **Maya** — `#00B14F` (green)
- **GCash** — `#007DFE` (blue)
- **UnionBank** — `#FF8000` (orange)
- **Cash** — `#888780` (neutral gray)

Users can add custom wallets (Seabank, GoTyme, BPI, BDO, etc.) with their own color and name. The wallet color appears as a dot next to transactions, a left-accent border on wallet cards, and a low-opacity cell tint in the year grid for paid bills.

## Screens

The MVP wireframes have been agreed on. Detailed wireframes exist as references; this section is the canonical screen list.

### Main tabs (sticky bottom navigation)

- **Bills** — current month at a glance. Summary card (paid / total expected), upcoming reminder callout, list of bills with paid items struck through. "Year view" link in the top-right.
- **Spending** — chronological log of one-off expenses, grouped by date. Floating + button for quick-add. Monthly total summary at top.
- **Wallets** — outflow-primary view. "Out this month" summary with bills/spending split, per-wallet outflow cards, "Record a transfer" affordance.
- **Insights** — total spent, bills/spending split, by-wallet breakdown, anomaly callouts ("Tech spending unusual this month"), 6-month trend chart.

### Supporting screens

- **Mark as paid** (bottom sheet from Bills, only when tapping an *unpaid* bill) — pre-filled amount (editable), wallet picker, paid date, period selector (defaults to bill's due-month, user-editable), optional note.
- **Payment details** (bottom sheet from Bills, only when tapping a *paid* bill) — bill name + period, amount, wallet, paid date, optional note. Single action: "Undo this payment" with a confirmation; on confirm the BillPayment record is hard-deleted and the row reverts to unpaid for that period. To correct a typo, the user undoes and marks paid again with the right values.
- **Year grid** (full screen, accessed from Bills) — horizontally scrollable rows × months matrix. Cells tinted by wallet color when paid, dashed border for forecasts, em-dash for non-due months.
- **Add / edit bill** — name, expected amount, frequency (monthly / quarterly / yearly / custom — custom takes an interval in months), first due date (one combined date picker — the day-of-month becomes the bill's recurring due-day; the year-month anchors quarterly / yearly / custom cadences; pre-filled to today), default payment source, reminder offset (days before) and reminder time (time of day), auto-forecast toggle.
- **Add / edit expense** — description, amount (optional), category, wallet, date, optional note.
- **Add / edit transfer** — from wallet, to wallet, amount, date, optional note.
- **Transfers history** (full screen, accessed from a "View transfers" link on the Wallets tab) — chronological list of all transfers across all time, grouped by date, tap a row to edit. Mirrors the Spending tab's layout pattern. Transfers don't appear on the Spending tab (they aren't spending) and don't roll into Wallets-tab outflow numbers (per `DATA_MODEL.md` §"Critical rule"), so this is the only place transfers are visible after recording.
- **Manage wallets** (Settings sub-screen) — list with edit, archive, color picker, show-balance toggle. When show-balance is enabled for the first time, prompts for current balance and back-computes opening balance.
- **Settings** — manage wallets, manage bills, categories, currency (PHP), theme (Light / Dark / System), notifications, export to JSON/CSV, backup status, app lock toggle.

### Onboarding (first run only)

1. **Pick wallets** — Maya, GCash, UnionBank, Cash pre-checked. "+ Add another" for less common ones. Continue.
2. **Add first bill** — bill form with placeholder examples. Skippable.
3. **Lands on Bills** — first bill highlighted with a tooltip pointing at it: "Tap when paid."

## Behavior decisions worth being explicit about

These are the answers to questions that came up during design. They go here so future-you (or future-Claude) doesn't have to re-derive them.

- **Period defaulting**: when marking a bill paid, the period defaults to the bill's expected due-month, derived from its cadence (frequency, start_period, interval_months) and due_day. The user can change it via a dropdown showing nearby due-periods. The default smartly picks the nearest unpaid due-period if the user is paying late.
- **Tapping a paid bill**: tapping a bill row whose current period is already paid opens the **payment details sheet**, not the mark-as-paid sheet. The details sheet shows the payment (amount, wallet, paid date, optional note) and exposes a single "Undo this payment" action that hard-deletes the BillPayment record after confirmation. Recording a payment for a *different* period of the same bill is reachable via the FAB or (later) the year grid. This split prevents the accidental-double-payment trap that arises when a user taps a paid row expecting to view or correct it but the mark-as-paid sheet records a new payment for an unpaid period instead. Editing a paid payment in place is intentionally not in v1; the user undoes and re-marks with corrected values.
- **Period uniqueness**: only one paid record per bill per period. Attempting to mark the same period paid twice prompts a confirm-overwrite or pick-different-period dialog.
- **Reminder lifecycle**: scheduling is per-bill, with per-bill time-of-day. When a bill is marked paid for a period, all pending reminders for that bill+period are cancelled. The next reminder is scheduled for the next period.
- **Soft date warning**: logging a transaction (bill payment, expense, transfer) with a date more than 30 days in the past shows a small "logging an older transaction — is this date correct?" notice that dismisses with one tap. Never blocking.
- **Currency input**: typing `1599` means ₱1,599.00. Typing `1599.5` means ₱1,599.50. Typing `1599.50` means ₱1,599.50. More than two decimals is rejected with a clear error. Negative numbers are rejected.
- **Currency display**: always two decimals, comma-separated thousands, peso sign prefix: `₱1,599.00`. Used everywhere — Bills, Spending, Wallets, Insights, year grid, exports.
- **Backups**: data file lives in iCloud (iOS) / Google Drive (Android) backup-eligible location. No code beyond placing the file correctly. Manual export from Settings produces a JSON file (full fidelity) or per-table CSVs (for spreadsheets). Both export options include archived records.
- **Theme**: defaults to System. The user can override in Settings → Preferences → Theme. Mid-session theme changes (system day-night switch) are reflected immediately when System is selected.
- **App lock**: off by default. When enabled, the user is prompted to authenticate immediately to verify biometrics work before the toggle commits. Once enabled, every cold start and every return-from-background prompts for authentication. No auto-lock-after-idle in v1.

## Open product questions

None blocking v1 build. If new questions come up during implementation, they belong here, not invented silently in code.

## Build order

The user wants to be using the app within weeks, not months. Ship in this order:

1. Data layer — schema, migrations, basic CRUD. No UI yet.
2. Bills tab + Mark-as-paid + Add bill — minimal end-to-end loop. The user can replace the bills layer of their spreadsheet at this point.
3. Wallets tab (outflow only, no balance toggle) — visibility into per-wallet outflow.
4. Spending tab + quick-add — the one-off log.
5. Onboarding — only needed once the rest is real.
6. Insights tab — aggregations and trends.
7. Year grid — preserves spreadsheet view.
8. Settings polish — manage wallets/bills/categories, theme picker, export, app lock.
9. Optional balance toggle on wallets.

After step 2, the app is daily-usable for the bills layer. That's the milestone to reach as fast as possible.

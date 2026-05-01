// Outflow aggregations for the Wallets tab.
//
// Source of truth: docs/DATA_MODEL.md §"Wallet outflow excluding transfers"
// and §"Behavioral rules" — transfers MUST NEVER appear in spending or
// outflow totals at the aggregate level. The Wallets tab "out this month"
// summary excludes transfers entirely; this module mirrors that rule.
//
// Filter semantics (per DATA_MODEL.md §"Wallet outflow excluding transfers"):
//   - BillPayment is filtered by `paid_date` (NOT `period`). The Wallets tab
//     answers "what went out this calendar month," not "what obligations
//     belonged to this period."
//   - Expense is filtered by `date`.
//   - `expense.amount` is nullable; null contributes 0 (per DATA_MODEL.md §Expense).
//
// Date strings are zero-padded ISO `YYYY-MM-DD` per the storage rules, so a
// row is "in" period P (`YYYY-MM`) iff its date string starts with `${P}-`.
// This is a lexicographic prefix match — correct, fast, and timezone-free.
//
// Pure functions only. The caller fetches rows from the DB and passes them in.

import type { InferSelectModel } from 'drizzle-orm';
import { bill_payment, expense } from '@/db/schema';

export type BillPayment = InferSelectModel<typeof bill_payment>;
export type Expense = InferSelectModel<typeof expense>;

export interface OutflowBreakdown {
  /** Total bill payments in the period, in centavos. */
  bills: number;
  /** Total one-off expenses in the period, in centavos. */
  spending: number;
  /** bills + spending. Convenience field. */
  total: number;
}

// `YYYY-MM`. Mirrors the regex used in logic/periods.ts so callers see
// consistent rejection behavior across the module boundary.
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function assertValidPeriod(period: string): void {
  if (typeof period !== 'string' || !PERIOD_RE.test(period)) {
    throw new Error(`Invalid period: ${String(period)}`);
  }
}

/** Whether an ISO `YYYY-MM-DD` date string falls within `period` (`YYYY-MM`). */
function isInPeriod(date: string, period: string): boolean {
  // Defensive: a date row outside `YYYY-MM-DD` shape would never satisfy the
  // prefix anyway, so a simple prefix check is sufficient. Storage guarantees
  // the shape; this is just the comparator.
  return typeof date === 'string' && date.startsWith(`${period}-`);
}

/**
 * Compute total outflow for the calendar month identified by `period`
 * (`YYYY-MM`). Transfers are intentionally NOT included — per DATA_MODEL.md
 * "Critical rule," transfers do not count toward net outflow.
 *
 * Filters BillPayments by `paid_date` (NOT period). Filters Expenses by
 * `date`. `expense.amount === null` contributes 0.
 */
export function getMonthlyOutflowTotal(
  payments: BillPayment[],
  expenses: Expense[],
  period: string,
): OutflowBreakdown {
  assertValidPeriod(period);

  let bills = 0;
  for (const p of payments) {
    if (isInPeriod(p.paid_date, period)) {
      bills += p.amount;
    }
  }

  let spending = 0;
  for (const e of expenses) {
    if (e.amount === null) continue; // amount-less placeholder, contributes 0
    if (isInPeriod(e.date, period)) {
      spending += e.amount;
    }
  }

  return { bills, spending, total: bills + spending };
}

/**
 * Same as getMonthlyOutflowTotal but per-wallet. Returns a Map keyed by
 * wallet id. Wallets with no outflow for the period are NOT in the map —
 * the caller is expected to merge with a full wallet list and show zeros
 * for missing entries.
 */
export function getMonthlyOutflowByWallet(
  payments: BillPayment[],
  expenses: Expense[],
  period: string,
): Map<string, OutflowBreakdown> {
  assertValidPeriod(period);

  const out = new Map<string, OutflowBreakdown>();

  const ensure = (walletId: string): OutflowBreakdown => {
    const existing = out.get(walletId);
    if (existing) return existing;
    const fresh: OutflowBreakdown = { bills: 0, spending: 0, total: 0 };
    out.set(walletId, fresh);
    return fresh;
  };

  for (const p of payments) {
    if (!isInPeriod(p.paid_date, period)) continue;
    const row = ensure(p.wallet_id);
    row.bills += p.amount;
    row.total += p.amount;
  }

  for (const e of expenses) {
    if (e.amount === null) continue;
    if (!isInPeriod(e.date, period)) continue;
    const row = ensure(e.wallet_id);
    row.spending += e.amount;
    row.total += e.amount;
  }

  return out;
}

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
import { addMonths, parse as parseDateFns, format as formatDateFns } from 'date-fns';
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

/** One point in a multi-month outflow trend (Insights tab chart). */
export interface MonthlyOutflowPoint {
  /** YYYY-MM. */
  period: string;
  /** Bill payments in the period, in centavos. */
  bills: number;
  /** One-off expenses in the period, in centavos. */
  spending: number;
  /** bills + spending. */
  total: number;
}

/** A category whose current-period spending is significantly above its rolling average. */
export interface CategoryAnomaly {
  categoryId: string;
  /** Centavos spent in the current period. */
  currentAmount: number;
  /** Rolling average of the last `lookbackMonths` historical periods (excludes current). */
  rollingAverage: number;
  /** currentAmount / rollingAverage. >=threshold means anomalous. */
  ratio: number;
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

/**
 * By-category spending breakdown for a single month.
 *
 * Only `Expense` rows contribute — bills don't have categories. The returned
 * Map is sparse: categories with zero spending are NOT keyed (same convention
 * as getMonthlyOutflowByWallet). The caller is expected to merge against a
 * full category list and render zeros as needed.
 *
 * Date filter is `expense.date` matching the month (lex-compare on `${period}-`).
 * `expense.amount === null` contributes 0 (per DATA_MODEL.md §Expense).
 */
export function getMonthlyOutflowByCategory(
  expenses: Expense[],
  period: string,
): Map<string, number> {
  assertValidPeriod(period);

  const out = new Map<string, number>();
  for (const e of expenses) {
    if (e.amount === null) continue;
    if (!isInPeriod(e.date, period)) continue;
    out.set(e.category_id, (out.get(e.category_id) ?? 0) + e.amount);
  }
  return out;
}

/**
 * Compute outflow for each of the given periods. Used by the Insights tab's
 * 6-month trend chart — the caller passes the periods to plot, the function
 * returns one MonthlyOutflowPoint per period in the SAME ORDER as the input.
 *
 * Periods with no outflow still appear with all-zeros so the chart has a point
 * for every month with no gaps. Reuses getMonthlyOutflowTotal internally.
 */
export function getMultiMonthOutflowTrend(
  payments: BillPayment[],
  expenses: Expense[],
  periods: string[],
): MonthlyOutflowPoint[] {
  return periods.map((period) => {
    const breakdown = getMonthlyOutflowTotal(payments, expenses, period);
    return {
      period,
      bills: breakdown.bills,
      spending: breakdown.spending,
      total: breakdown.total,
    };
  });
}

/** Subtract `n` months from a `YYYY-MM` period string. */
function shiftPeriod(period: string, deltaMonths: number): string {
  // Pin to the 1st at local midnight; date-fns `addMonths` handles signs and
  // rollovers (e.g. shifting "2026-01" by -2 → "2025-11").
  const d = parseDateFns(period, 'yyyy-MM', new Date(0));
  return formatDateFns(addMonths(d, deltaMonths), 'yyyy-MM');
}

/**
 * Detect categories whose current-month spending is significantly above their
 * rolling average. The Insights tab shows a callout for each returned anomaly
 * ("Tech spending unusual this month").
 *
 * Algorithm (per the briefing):
 *   1. Compute current-period spending by category.
 *   2. Compute the rolling average over the previous `lookbackMonths` periods
 *      (excluding the current period).
 *   3. Include if `currentAmount / rollingAverage >= threshold`. Default 1.5.
 *   4. Skip categories with fewer than `lookbackMonths / 2` non-zero historical
 *      periods — the average is too noisy with too little data. (Categories
 *      whose rollingAverage would be 0 are filtered out by this rule too:
 *      a zero historical sum implies zero non-zero historical periods, which
 *      fails the half-lookback minimum and is therefore skipped.)
 *   5. Skip categories with zero current spending — "unusual" should mean
 *      "I spent more," not "I spent nothing this month."
 *
 * Sorted by `ratio` descending (biggest spike first).
 */
export function getCategoryAnomalies(
  expenses: Expense[],
  currentPeriod: string,
  lookbackMonths: number,
  threshold: number = 1.5,
): CategoryAnomaly[] {
  assertValidPeriod(currentPeriod);
  if (!Number.isInteger(lookbackMonths) || lookbackMonths <= 0) {
    throw new Error(`Invalid lookbackMonths: ${String(lookbackMonths)}`);
  }

  // Current-period spending by category.
  const currentByCategory = getMonthlyOutflowByCategory(expenses, currentPeriod);

  // Build per-category historical totals across the lookback window. Compute
  // each historical month's category breakdown ONCE (not once per category) by
  // iterating periods and merging.
  const historyTotals = new Map<string, number>(); // categoryId → centavos sum
  const historyNonZeroPeriodCount = new Map<string, number>(); // categoryId → count of non-zero historical periods

  for (let i = 1; i <= lookbackMonths; i++) {
    const histPeriod = shiftPeriod(currentPeriod, -i);
    const byCat = getMonthlyOutflowByCategory(expenses, histPeriod);
    for (const [categoryId, amount] of byCat) {
      if (amount <= 0) continue; // sparse Map already excludes zeros, but be defensive
      historyTotals.set(categoryId, (historyTotals.get(categoryId) ?? 0) + amount);
      historyNonZeroPeriodCount.set(
        categoryId,
        (historyNonZeroPeriodCount.get(categoryId) ?? 0) + 1,
      );
    }
  }

  // Minimum non-zero historical periods required to consider a category.
  // For lookbackMonths=3 this is 2 (>=2 historical non-zero periods).
  const minNonZeroPeriods = Math.ceil(lookbackMonths / 2);

  const out: CategoryAnomaly[] = [];

  for (const [categoryId, currentAmount] of currentByCategory) {
    if (currentAmount <= 0) continue; // Rule 5: no zero-spend anomalies.

    const nonZeroCount = historyNonZeroPeriodCount.get(categoryId) ?? 0;
    if (nonZeroCount < minNonZeroPeriods) continue; // Rule 4: insufficient history.

    // Rolling average is over the FULL lookback window (zero-spend months count
    // as zeros toward the denominator), not just the non-zero months. That way
    // a quiet stretch followed by a spike correctly reads as anomalous.
    const total = historyTotals.get(categoryId) ?? 0;
    const rollingAverage = total / lookbackMonths;
    if (rollingAverage <= 0) continue; // Defensive; the nonZeroCount check should already catch this.

    const ratio = currentAmount / rollingAverage;
    if (ratio < threshold) continue;

    out.push({
      categoryId,
      currentAmount,
      // Round so the integer-centavos contract holds for stored values.
      rollingAverage: Math.round(rollingAverage),
      ratio,
    });
  }

  out.sort((a, b) => b.ratio - a.ratio);
  return out;
}

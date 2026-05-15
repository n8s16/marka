// Period and due-date math for Bills.
//
// Anchored on `Bill.start_period` per docs/DATA_MODEL.md §"Bill" and
// docs/DECISIONS.md entries 21–23. Every cadence-aware calculation lives here:
//
//   - Is a given YYYY-MM period a due-period for this bill? (cadence rules)
//   - What's the actual YYYY-MM-DD due-date for that period? (due_day clamps to
//     last-day-of-month for short months — DECISION 21.)
//   - What's the next/previous due-period from a reference point?
//   - What due-periods fall inside a range?
//   - What's the smart default period for the mark-as-paid sheet?
//
// The data layer does NOT validate cadence fields (per the brief). This module
// is the only defense — `interval_months` null/0/negative on a custom bill is
// treated as malformed: cadence functions return false/null rather than crash.
//
// All date math goes through date-fns. Periods are `YYYY-MM` strings; due-dates
// are `YYYY-MM-DD` strings.

import {
  parse as parseDateFns,
  format as formatDateFns,
  addMonths,
  differenceInCalendarMonths,
  isValid,
  lastDayOfMonth,
} from 'date-fns';

// ─── Types ───────────────────────────────────────────────────────────────────

export type Frequency = 'monthly' | 'quarterly' | 'yearly' | 'custom';

/**
 * The minimum subset of Bill fields required for cadence calculations. Lets
 * callers pass a partial row without dragging in unrelated columns.
 *
 * `end_period` is the optional inclusive last due-month (`YYYY-MM`). When
 * null, the bill recurs indefinitely. When set, any period strictly after
 * `end_period` is NOT a due-period regardless of cadence — per
 * docs/DATA_MODEL.md §"Bill" and PRD §"Finite-duration bills".
 */
export type BillCadence = {
  frequency: Frequency;
  interval_months: number | null;
  start_period: string; // YYYY-MM
  end_period: string | null; // YYYY-MM inclusive, or null for unbounded
};

export type BillDueDay = BillCadence & {
  due_day: number; // 1–31; clamps to last-day-of-month for short months
};

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Parse a `YYYY-MM` period string into a Date pinned to the 1st at local midnight. */
function periodToDate(period: string): Date | null {
  if (typeof period !== 'string') return null;
  // Strict shape check — date-fns will tolerate "2026-4" or "2026-04-foo" so we
  // gate on the regex first.
  if (!/^\d{4}-\d{2}$/.test(period)) return null;
  const d = parseDateFns(period, 'yyyy-MM', new Date(0));
  return isValid(d) ? d : null;
}

/** Format a Date as a `YYYY-MM` period string. */
function dateToPeriod(d: Date): string {
  return formatDateFns(d, 'yyyy-MM');
}

/** Format a Date as a `YYYY-MM-DD` date string. */
function dateToYmd(d: Date): string {
  return formatDateFns(d, 'yyyy-MM-dd');
}

/**
 * Returns the cadence step in months for this bill. Null if the bill is
 * malformed (e.g. `custom` with non-positive `interval_months`).
 */
function stepMonths(bill: BillCadence): number | null {
  switch (bill.frequency) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'yearly':
      return 12;
    case 'custom': {
      const n = bill.interval_months;
      if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) return null;
      return n;
    }
    default:
      return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns true iff `period` is a due-period for this bill, given its cadence
 * and `start_period` anchor. A period earlier than `start_period` is never due
 * regardless of frequency. When `end_period` is set, any period strictly
 * after `end_period` is never due either (lexical compare on `YYYY-MM` strings
 * matches chronological order). Malformed bills (e.g. custom + invalid
 * interval) return false.
 */
export function isPeriodDueForBill(bill: BillCadence, period: string): boolean {
  const start = periodToDate(bill.start_period);
  const target = periodToDate(period);
  if (!start || !target) return false;

  const step = stepMonths(bill);
  if (step === null) return false;

  const diff = differenceInCalendarMonths(target, start);
  if (diff < 0) return false;
  // end_period caps the sequence (inclusive). Lexical compare on YYYY-MM is
  // chronological. A malformed end_period (wrong shape) is treated as absent
  // rather than rejecting the bill outright — the form layer validates shape.
  if (bill.end_period && /^\d{4}-\d{2}$/.test(bill.end_period)) {
    if (period > bill.end_period) return false;
  }
  return diff % step === 0;
}

/**
 * Returns the actual due-date (`YYYY-MM-DD`) for a given period, clamping
 * `due_day` to the last day of the month when the month has fewer days
 * (DECISIONS §21). Returns null if the period is not a due-period for this
 * bill or if inputs are malformed.
 */
export function getDueDateForPeriod(
  bill: BillDueDay,
  period: string,
): string | null {
  if (!isPeriodDueForBill(bill, period)) return null;
  const target = periodToDate(period);
  if (!target) return null;
  if (
    typeof bill.due_day !== 'number' ||
    !Number.isInteger(bill.due_day) ||
    bill.due_day < 1 ||
    bill.due_day > 31
  ) {
    return null;
  }

  const last = lastDayOfMonth(target);
  const day = Math.min(bill.due_day, last.getDate());
  // Build the final date by setting the day-of-month on the period anchor.
  const due = new Date(target.getFullYear(), target.getMonth(), day);
  return dateToYmd(due);
}

/**
 * Returns the next due-period strictly after `fromPeriod`, or null if
 * indeterminate (malformed bill, malformed input) or if the next candidate
 * would exceed `end_period` (finite-duration bills — PRD §"Finite-duration
 * bills"). For unbounded bills (`end_period` null) this only returns null on
 * malformed input.
 */
export function getNextDuePeriod(
  bill: BillCadence,
  fromPeriod: string,
): string | null {
  const start = periodToDate(bill.start_period);
  const from = periodToDate(fromPeriod);
  if (!start || !from) return null;
  const step = stepMonths(bill);
  if (step === null) return null;

  const diff = differenceInCalendarMonths(from, start);
  let candidate: string;
  if (diff < 0) {
    // `fromPeriod` predates the start — the next due-period is `start_period`
    // itself.
    candidate = dateToPeriod(start);
  } else {
    // Number of complete steps already passed (floor). Add one to advance to
    // the next step.
    const nextStepIndex = Math.floor(diff / step) + 1;
    candidate = dateToPeriod(addMonths(start, nextStepIndex * step));
  }
  // Cap at end_period (inclusive). If the next candidate is past the end,
  // there is no next due-period.
  if (
    bill.end_period &&
    /^\d{4}-\d{2}$/.test(bill.end_period) &&
    candidate > bill.end_period
  ) {
    return null;
  }
  return candidate;
}

/**
 * Returns the most recent due-period strictly before `fromPeriod`, or null if
 * `fromPeriod` is `start_period` or earlier (no prior due-period exists).
 *
 * `end_period` only forward-caps the sequence — when `fromPeriod` is past
 * `end_period`, the candidate is additionally clamped to the last actual
 * due-period (the largest on-cadence period that is `<= end_period`). If
 * `end_period` itself is before `start_period`, there are no due-periods at
 * all and the function returns null.
 */
export function getPrevDuePeriod(
  bill: BillCadence,
  fromPeriod: string,
): string | null {
  const start = periodToDate(bill.start_period);
  const from = periodToDate(fromPeriod);
  if (!start || !from) return null;
  const step = stepMonths(bill);
  if (step === null) return null;

  const diff = differenceInCalendarMonths(from, start);
  if (diff <= 0) return null; // at or before start → no prior due-period

  // If `fromPeriod` is itself a due-period, "strictly before" means one step
  // back. Otherwise floor to the previous due-period.
  let prevStepIndex: number;
  if (diff % step === 0) {
    prevStepIndex = diff / step - 1;
  } else {
    prevStepIndex = Math.floor(diff / step);
  }
  if (prevStepIndex < 0) return null;
  let prevPeriod = dateToPeriod(addMonths(start, prevStepIndex * step));

  // If end_period is set and the candidate exceeds it (happens when
  // fromPeriod is past end_period), walk back until we find an on-cadence
  // period that fits within the [start_period, end_period] window.
  if (bill.end_period && /^\d{4}-\d{2}$/.test(bill.end_period)) {
    while (prevPeriod > bill.end_period) {
      prevStepIndex -= 1;
      if (prevStepIndex < 0) return null;
      prevPeriod = dateToPeriod(addMonths(start, prevStepIndex * step));
    }
  }

  return prevPeriod;
}

/**
 * Returns all due-periods between `rangeStart` and `rangeEnd` inclusive
 * (`YYYY-MM` strings). Returns [] for malformed bills or inverted ranges.
 *
 * `end_period`, when set, additionally truncates the sequence — any candidate
 * strictly after `end_period` is dropped, even if it falls inside the range.
 */
export function listDuePeriodsInRange(
  bill: BillCadence,
  rangeStart: string,
  rangeEnd: string,
): string[] {
  const start = periodToDate(bill.start_period);
  const rs = periodToDate(rangeStart);
  const re = periodToDate(rangeEnd);
  if (!start || !rs || !re) return [];
  if (differenceInCalendarMonths(re, rs) < 0) return [];

  const step = stepMonths(bill);
  if (step === null) return [];

  const endCap =
    bill.end_period && /^\d{4}-\d{2}$/.test(bill.end_period)
      ? bill.end_period
      : null;

  // Walk forward from the first due-period >= rangeStart.
  // Compute the smallest k such that start + k*step >= rangeStart.
  const diffStartToRangeStart = differenceInCalendarMonths(rs, start);
  let k = diffStartToRangeStart <= 0 ? 0 : Math.ceil(diffStartToRangeStart / step);

  const out: string[] = [];
  // Cap iteration to a sane upper bound so a malformed input can't loop forever.
  const MAX_ITERS = 10_000;
  for (let i = 0; i < MAX_ITERS; i++) {
    const candidate = addMonths(start, k * step);
    if (differenceInCalendarMonths(candidate, re) > 0) break;
    const candidateStr = dateToPeriod(candidate);
    // end_period cap: stop iterating once we're past it. (No on-cadence
    // candidate further out can satisfy the bill anyway.)
    if (endCap && candidateStr > endCap) break;
    if (differenceInCalendarMonths(candidate, rs) >= 0) {
      out.push(candidateStr);
    }
    k++;
  }
  return out;
}

/**
 * The default period for the mark-as-paid sheet (PRD §"Period defaulting").
 *
 * Algorithm:
 *   1. Take this bill's due-periods within ±2 cadence steps of today's period
 *      (start_period filtering is automatic — earlier candidates are skipped).
 *   2. Drop candidates that already have a payment (`paidPeriods`).
 *   3. Partition by period (NOT by due-date) into past-or-current
 *      (period <= today's period) and future (period > today's period).
 *      Past-or-current always wins over future when both partitions are
 *      non-empty — "pay your overdue bill before pre-paying next period."
 *   4. Within the chosen partition, pick the candidate whose period is
 *      closest to today's period (by month-distance). Final tiebreaker:
 *      earlier period first, for deterministic ordering.
 *
 * Period-vs-period comparison (rather than due-date-vs-today) is what makes
 * the algorithm cadence-aware: for a quarterly bill where today is 2026-05-15,
 * the unpaid 2026-03 period wins over 2026-06 because 2026-03 is past, even
 * though 2026-06 is closer in calendar days. For a monthly bill where today
 * is 2026-04-05 with due_day 15, 2026-04 is "current" by period (distance 0)
 * even though its due-date is still ahead — no need to default to a long-ago
 * historical period.
 *
 * Behaviour examples (verified in periods.test.ts):
 *   - Quarterly, start 2026-03, today 2026-05-15, no payments → 2026-03
 *     (the only past-or-current candidate; 2026-06 is future).
 *   - Quarterly, today 2026-03-05, due_day 15 → 2026-03 (current period).
 *   - Quarterly, paid 2026-03, today 2026-06-01 → 2026-06 (current period).
 *   - Quarterly, paid 2026-03 + 2026-06, today 2026-08-15 → 2026-09 (no
 *     past-or-current unpaid candidate; closest future).
 *   - Yearly, start 2026-03, today 2026-04-01, no payments → 2026-03 (only
 *     past-or-current candidate in window).
 *   - Monthly, today 2026-04-05, no payments → 2026-04 (current period; closer
 *     than the prior unpaid months).
 *
 * Returns `bill.start_period` as a defensive fallback if no candidate exists
 * (malformed bill, all candidates paid).
 */
export function getSmartDefaultPeriodForPayment(
  bill: BillDueDay,
  today: Date,
  paidPeriods: string[],
): string {
  const step = stepMonths(bill);
  const start = periodToDate(bill.start_period);
  if (step === null || !start) return bill.start_period;

  const todayPeriodStr = dateToPeriod(today);
  const todayPeriodDate = periodToDate(todayPeriodStr);
  if (!todayPeriodDate) return bill.start_period;

  // Candidate window: ±2 cadence steps around today's period. listDuePeriodsInRange
  // skips anything before start_period.
  const windowStart = addMonths(todayPeriodDate, -2 * step);
  const windowEnd = addMonths(todayPeriodDate, 2 * step);

  const paid = new Set(paidPeriods);

  const candidates = listDuePeriodsInRange(
    bill,
    dateToPeriod(windowStart),
    dateToPeriod(windowEnd),
  ).filter((p) => !paid.has(p));

  if (candidates.length === 0) return bill.start_period;

  type Scored = {
    period: string;
    distanceMonths: number;
    isPastOrCurrent: boolean;
  };

  const scored: Scored[] = candidates.map((period) => {
    const candidateDate = periodToDate(period)!;
    const monthDiff = differenceInCalendarMonths(candidateDate, todayPeriodDate);
    return {
      period,
      distanceMonths: Math.abs(monthDiff),
      isPastOrCurrent: monthDiff <= 0, // period <= today's period
    };
  });

  // Past-or-current always wins over future (pay your overdue bill before
  // pre-paying next period). Within a partition, take the closest by month
  // distance from today's period. Final tiebreaker: earlier period for stability.
  scored.sort((a, b) => {
    if (a.isPastOrCurrent !== b.isPastOrCurrent) return a.isPastOrCurrent ? -1 : 1;
    if (a.distanceMonths !== b.distanceMonths) return a.distanceMonths - b.distanceMonths;
    return a.period.localeCompare(b.period);
  });

  return scored[0].period;
}

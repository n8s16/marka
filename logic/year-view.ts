// Year view v2 — per-month aggregation for the vertical month list.
//
// Pure functions. The screen calls these once per year with raw Bill[] +
// BillPayment[] arrays it loaded from the DB; the result is fully derived
// (no I/O, no state). Tests in `logic/year-view.test.ts` exercise edge
// cases (cadence overlaps, multi-payment months, overdue rules).
//
// Per docs/year-view-redesign.md §"Behavioural rules":
//
//   total_paid       = sum(BillPayment.amount where period = "YYYY-MM")
//   paid_count       = count(BillPayment where period = "YYYY-MM")
//   total_bills_due  = count(Bill where bill is due in "YYYY-MM" per cadence)
//   upcoming_amount  = sum(forecasted amounts for unpaid bills due in "YYYY-MM")
//
// Date-strip rules for the expanded month:
//
//   bill due, payment exists                            → paid
//   bill due, unpaid, due_date < today                  → overdue
//   bill due, unpaid, due_date >= today                 → upcoming
//
// "Today and within reminder window" collapses into 'overdue' for v2 — same
// visual treatment, and the reminder UX lives on the Bills tab anyway.

import { differenceInCalendarDays, lastDayOfMonth, parseISO } from 'date-fns';

import type { InferSelectModel } from 'drizzle-orm';
import { bill as billTable, bill_payment as billPaymentTable } from '@/db/schema';
import { getForecastForBill } from './forecasts';
import { getDueDateForPeriod, isPeriodDueForBill } from './periods';

export type Bill = InferSelectModel<typeof billTable>;
export type BillPayment = InferSelectModel<typeof billPaymentTable>;

/** A single bill's status within a month. */
export type MonthDayCellStatus =
  | { kind: 'paid'; payment: BillPayment }
  | { kind: 'overdue'; forecast: number /* centavos */ }
  | { kind: 'upcoming'; forecast: number /* centavos */ };

/**
 * One bill instance positioned on a specific day of the month, with its
 * paid / overdue / upcoming status. Multiple bills can share a `dueDay`;
 * the date-strip component handles stacking (per redesign §Open Q #2).
 */
export interface MonthDayCell {
  bill: Bill;
  /** 1..daysInMonth — clamped down for bills with due_day > daysInMonth. */
  dueDay: number;
  status: MonthDayCellStatus;
}

/** Per-month derived data for the month list. */
export interface MonthSummary {
  /** YYYY-MM */
  period: string;
  /** 0..11 — same as Date#getMonth() for convenience. */
  monthIndex: number;
  /** 28..31 — last day of THIS month. */
  daysInMonth: number;
  /** True iff `period === today's period` AND year matches. */
  isCurrentMonth: boolean;
  /** True iff this month is strictly after the current calendar month. */
  isFutureMonth: boolean;
  /** Centavos paid in this period (sum of payments with period=YYYY-MM). */
  totalPaid: number;
  /** Number of payments recorded for bills with period=YYYY-MM. */
  paidCount: number;
  /** Total bills that have a due-period of YYYY-MM (paid + unpaid). */
  totalBillsDue: number;
  /**
   * Forecasted centavos for unpaid bills due in this period. Includes
   * overdue. Zero for past months that have no overdue, zero for paid
   * months. For the year summary, summing this across months gives the
   * year's outstanding total.
   */
  upcomingAmount: number;
  /** One cell per due-bill in this period, sorted by dueDay asc, bill name asc. */
  cells: MonthDayCell[];
}

/** Year-level totals shown in the summary card above the month list. */
export interface YearSummary {
  year: number;
  /** True iff this year is strictly behind the current calendar year. */
  isPast: boolean;
  /** True iff this year is the current calendar year. */
  isCurrent: boolean;
  totalPaid: number;
  paidCount: number;
  totalBillsDue: number;
  upcomingAmount: number;
}

const MONTHS_IN_YEAR = 12;

/**
 * Build the 12-element month-summary array for `year`. Months are
 * returned January→December regardless of where today falls.
 *
 * Inputs:
 *   - year                    — the calendar year to summarise
 *   - today                   — captured once by the caller; used for
 *                                isCurrentMonth / overdue distinctions
 *   - bills                   — all ACTIVE bills (archived bills don't
 *                                appear in the year view)
 *   - paymentsByBillByPeriod  — Map<billId, Map<period, BillPayment>>
 *                                pre-built by the screen-level hook so the
 *                                per-cell lookup is O(1)
 *   - recentPaymentsByBill    — Map<billId, BillPayment[]> last-3 by period
 *                                desc, the same input shape `getForecastForBill`
 *                                wants
 */
export function buildMonthSummariesForYear(
  year: number,
  today: Date,
  bills: Bill[],
  paymentsByBillByPeriod: Map<string, Map<string, BillPayment>>,
  recentPaymentsByBill: Map<string, BillPayment[]>,
): MonthSummary[] {
  const out: MonthSummary[] = [];
  const todayYmd = formatYmd(today);
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();

  for (let monthIndex = 0; monthIndex < MONTHS_IN_YEAR; monthIndex++) {
    const period = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    const daysInMonth = lastDayOfMonth(new Date(year, monthIndex, 1)).getDate();

    const isCurrentMonth = year === todayYear && monthIndex === todayMonth;
    const isFutureMonth =
      year > todayYear ||
      (year === todayYear && monthIndex > todayMonth);

    const cells: MonthDayCell[] = [];
    let totalPaid = 0;
    let paidCount = 0;
    let upcomingAmount = 0;

    for (const bill of bills) {
      if (!isPeriodDueForBill(bill, period)) continue;

      const payment = paymentsByBillByPeriod.get(bill.id)?.get(period);
      const dueDay = Math.min(
        Math.max(1, Math.trunc(bill.due_day)),
        daysInMonth,
      );

      if (payment) {
        totalPaid += payment.amount;
        paidCount += 1;
        cells.push({
          bill,
          dueDay,
          status: { kind: 'paid', payment },
        });
        continue;
      }

      // Unpaid. Decide overdue vs upcoming by comparing due-date to today.
      const dueYmd = getDueDateForPeriod(bill, period);
      const isOverdue = dueYmd !== null && isStrictlyBefore(dueYmd, todayYmd);
      const recents = recentPaymentsByBill.get(bill.id) ?? [];
      const forecast = getForecastForBill(bill, recents);
      upcomingAmount += forecast;

      cells.push({
        bill,
        dueDay,
        status: isOverdue
          ? { kind: 'overdue', forecast }
          : { kind: 'upcoming', forecast },
      });
    }

    // Stable sort: dueDay asc, then bill name asc as tie-breaker so two
    // bills on the same day always render in the same order across renders.
    cells.sort((a, b) => {
      if (a.dueDay !== b.dueDay) return a.dueDay - b.dueDay;
      return a.bill.name.localeCompare(b.bill.name);
    });

    out.push({
      period,
      monthIndex,
      daysInMonth,
      isCurrentMonth,
      isFutureMonth,
      totalPaid,
      paidCount,
      totalBillsDue: cells.length,
      upcomingAmount,
      cells,
    });
  }

  return out;
}

/**
 * Roll the per-month summaries up into a single year-level summary for the
 * top card. `isPast` / `isCurrent` are derived from `today`; the caller
 * passes the same `today` used by `buildMonthSummariesForYear` so the two
 * stay aligned.
 */
export function getYearSummary(
  year: number,
  today: Date,
  monthSummaries: MonthSummary[],
): YearSummary {
  const todayYear = today.getFullYear();
  const isCurrent = year === todayYear;
  const isPast = year < todayYear;

  let totalPaid = 0;
  let paidCount = 0;
  let totalBillsDue = 0;
  let upcomingAmount = 0;
  for (const m of monthSummaries) {
    totalPaid += m.totalPaid;
    paidCount += m.paidCount;
    totalBillsDue += m.totalBillsDue;
    upcomingAmount += m.upcomingAmount;
  }

  return {
    year,
    isPast,
    isCurrent,
    totalPaid,
    paidCount,
    totalBillsDue,
    upcomingAmount,
  };
}

// ---------- helpers ----------

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isStrictlyBefore(a: string, b: string): boolean {
  // Both are YYYY-MM-DD strings — lexical compare matches chronological order.
  return a.localeCompare(b) < 0;
}

// Exported for the `differenceInCalendarDays` import to stay used. (Kept as
// a leaf utility in case future logic wants "due in N days" framing.)
export function daysUntil(targetYmd: string, today: Date): number {
  return differenceInCalendarDays(parseISO(targetYmd), today);
}

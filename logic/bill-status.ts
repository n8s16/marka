// Bill status resolution for a (bill, period) coordinate.
//
// The rules live in docs/DATA_MODEL.md §"Bill status for a given period". This
// file enforces them as a discriminated union so call sites can render each
// status without re-deriving the math.
//
//   - paid:     a BillPayment exists for (bill_id, period).
//   - unpaid:   a past due-period with no payment.
//   - overdue:  the *current* period (period === today's YYYY-MM), today is
//               past the due_day, no payment.
//   - upcoming: the current period, today is on or before the due_day, no
//               payment. Surfaces `daysUntilDue` and `reminderActive` for
//               reminder-callout UI.
//   - future:   a future due-period (period > today's YYYY-MM), no payment.
//   - not_due:  the period is not a due-period for this bill (cadence skip).
//
// Precondition: if `payment` is given, it must already match (bill.id, period).
// We do not re-validate that — types make it the caller's responsibility.

import type { InferSelectModel } from 'drizzle-orm';
import { differenceInCalendarDays, isAfter, isValid, parse, startOfDay } from 'date-fns';
import { bill as billTable, bill_payment as billPaymentTable } from '@/db/schema';
import {
  isPeriodDueForBill,
  getDueDateForPeriod,
  type BillDueDay,
  type Frequency,
} from './periods';

type BillRow = InferSelectModel<typeof billTable>;
type BillPaymentRow = InferSelectModel<typeof billPaymentTable>;

/**
 * Subset of Bill fields the status calculation needs. Compatible with
 * `InferSelectModel<typeof bill>` so the caller can pass a full row.
 */
export type BillForStatus = BillDueDay & {
  reminder_offset_days: number;
};

export type BillStatus =
  | { kind: 'paid'; payment: BillPaymentRow }
  | { kind: 'unpaid' }
  | { kind: 'overdue' }
  | { kind: 'upcoming'; daysUntilDue: number; reminderActive: boolean }
  | { kind: 'future' }
  | { kind: 'not_due' };

// Re-export for callers that want one type-import from this module.
export type { Frequency };

/** Format a Date as `YYYY-MM` without dragging date-fns format into callers. */
function todayPeriod(today: Date): string {
  const y = today.getFullYear();
  const m = (today.getMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Resolve the status of a bill for a given period as of `today`. Returns a
 * discriminated union — see file header for kinds.
 *
 * `payment` is the BillPayment for (bill, period) if one exists; pass undefined
 * otherwise. The caller is responsible for fetching it. We do not validate
 * that `payment.bill_id === bill.id` and `payment.period === period`; types
 * (and a one-row-per-(bill,period) DB constraint) make that the caller's job.
 */
export function getBillStatusForPeriod(
  bill: BillForStatus,
  period: string,
  today: Date,
  payment: BillPaymentRow | undefined,
): BillStatus {
  // Paid wins regardless of cadence — a recorded payment is ground truth even
  // if the period would otherwise be "not due" (which shouldn't happen given
  // the unique index, but we render reality, not theory).
  if (payment) {
    return { kind: 'paid', payment };
  }

  if (!isPeriodDueForBill(bill, period)) {
    return { kind: 'not_due' };
  }

  const tp = todayPeriod(today);
  if (period < tp) {
    return { kind: 'unpaid' };
  }
  if (period > tp) {
    return { kind: 'future' };
  }

  // Period === current month. Compute due-date and compare to today.
  const dueStr = getDueDateForPeriod(bill, period);
  if (!dueStr) {
    // Shouldn't happen — isPeriodDueForBill returned true. Defensive default.
    return { kind: 'upcoming', daysUntilDue: 0, reminderActive: false };
  }
  const dueDate = parse(dueStr, 'yyyy-MM-dd', new Date(0));
  if (!isValid(dueDate)) {
    return { kind: 'upcoming', daysUntilDue: 0, reminderActive: false };
  }

  const todayMidnight = startOfDay(today);
  const dueMidnight = startOfDay(dueDate);

  if (isAfter(todayMidnight, dueMidnight)) {
    return { kind: 'overdue' };
  }

  // On or before due-date: upcoming. daysUntilDue is calendar days from today
  // (midnight-to-midnight) to the due-date. Negative would mean past due, but
  // we already filtered that.
  const daysUntilDue = differenceInCalendarDays(dueMidnight, todayMidnight);
  const reminderActive =
    typeof bill.reminder_offset_days === 'number' &&
    bill.reminder_offset_days >= 0 &&
    daysUntilDue <= bill.reminder_offset_days;

  return { kind: 'upcoming', daysUntilDue, reminderActive };
}

// Make `BillRow` reachable for callers that want to import the full row type
// from one place. Not strictly required by the public API but a small DX win.
export type { BillRow, BillPaymentRow };

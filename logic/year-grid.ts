// Year grid cell resolution.
//
// Per docs/DATA_MODEL.md §"Year grid cell resolution":
//
//   For each (bill, period) coordinate in the grid:
//     let payment = BillPayment where bill_id = bill.id and period = period
//     if payment exists:
//       → render payment.amount, strikethrough, tinted with payment.wallet's color
//     elif this period is a due-period for the bill (per the cadence rules):
//       → render forecast value (per rule above), dashed border, no color tint
//     else:
//       → render em-dash
//
// The "forecasts never overwrite actuals" rule (DATA_MODEL.md §"Behavioral
// rules") is enforced by the order of checks: a payment short-circuits the
// forecast branch entirely.
//
// Pure function. The caller does the per-bill payment lookup and the
// recentPayments slice — see the doc on getYearGridCell for the contract.

import type { InferSelectModel } from 'drizzle-orm';
import { bill as billTable, bill_payment as billPaymentTable } from '@/db/schema';
import { isPeriodDueForBill } from './periods';
import { getForecastForBill } from './forecasts';

export type Bill = InferSelectModel<typeof billTable>;
export type BillPayment = InferSelectModel<typeof billPaymentTable>;

export type YearGridCell =
  | { kind: 'paid'; payment: BillPayment }
  | { kind: 'forecast'; amount: number /* centavos */ }
  | { kind: 'not_due' };

/**
 * Resolve the render state of a single (bill, period) cell in the year grid.
 *
 * - If a matching payment exists → 'paid' with the payment row attached
 *   (caller needs payment.wallet_id to look up the wallet brand color, and
 *   payment.amount for display).
 * - Else if the period is a due-period for the bill (per the cadence rules
 *   in /logic/periods.ts) → 'forecast' with the projected amount in
 *   centavos (computed via getForecastForBill from /logic/forecasts.ts).
 * - Else → 'not_due'. Caller renders em-dash.
 *
 * Inputs:
 *   - bill: the row to resolve. Cadence fields (frequency, interval_months,
 *     start_period) drive the due-period check; auto_forecast +
 *     expected_amount drive the forecast.
 *   - period: YYYY-MM string for the cell's column. Caller validates format.
 *   - payment: the BillPayment for (bill.id, period) if one exists, else
 *     undefined. Caller is responsible for the lookup — we don't accept a
 *     full payment list here because the year grid renders many cells per
 *     bill and the caller can build a Map<period, payment> per bill once
 *     and pass payment-or-undefined per cell.
 *   - recentPayments: last 3 BillPayments for this bill, sorted by period
 *     desc. Same input contract as getForecastForBill — pass-through to it
 *     for the 'forecast' branch. The caller pre-computes once per bill.
 */
export function getYearGridCell(
  bill: Pick<
    Bill,
    'frequency' | 'interval_months' | 'start_period' | 'auto_forecast' | 'expected_amount'
  >,
  period: string,
  payment: BillPayment | undefined,
  recentPayments: BillPayment[],
): YearGridCell {
  // Order matters: forecasts NEVER overwrite actuals (DATA_MODEL.md
  // §"Behavioral rules"). Check payment first, then cadence, then fall through.
  if (payment !== undefined) {
    return { kind: 'paid', payment };
  }

  if (isPeriodDueForBill(bill, period)) {
    const amount = getForecastForBill(bill, recentPayments);
    return { kind: 'forecast', amount };
  }

  return { kind: 'not_due' };
}

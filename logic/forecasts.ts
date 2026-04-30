// Forecast value for a Bill in a future period.
//
// Per docs/DATA_MODEL.md §"Forecast for a future period":
//
//   if bill.auto_forecast is true:
//     forecast = average of last 3 BillPayments (by period desc)
//     (fewer than 3 actuals → average whatever's available; zero → expected_amount)
//   else:
//     forecast = bill.expected_amount
//
// Forecasts ONLY populate future periods. Past periods without a payment are
// "unpaid", not auto-filled — see getBillStatusForPeriod.
//
// All math is on integer centavos. Averages are rounded to the nearest centavo
// with Math.round (drops fractional centavos).

import type { InferSelectModel } from 'drizzle-orm';
import { bill_payment as billPaymentTable } from '@/db/schema';

type BillPaymentRow = InferSelectModel<typeof billPaymentTable>;

export type BillForForecast = {
  auto_forecast: boolean;
  expected_amount: number;
};

/**
 * Returns the forecast amount in centavos for this bill.
 *
 * For performance, prefer to pre-filter `recentPayments` to the last 3 by
 * `period` desc — but this function defensively re-sorts internally so callers
 * can pass a full list and still get the right answer.
 */
export function getForecastForBill(
  bill: BillForForecast,
  recentPayments: BillPaymentRow[],
): number {
  if (!bill.auto_forecast) {
    return bill.expected_amount;
  }

  if (!Array.isArray(recentPayments) || recentPayments.length === 0) {
    return bill.expected_amount;
  }

  // Defensive sort: period desc. Period strings are YYYY-MM so lexical compare
  // is correct.
  const sorted = [...recentPayments].sort((a, b) => b.period.localeCompare(a.period));
  const window = sorted.slice(0, 3);

  const total = window.reduce((acc, p) => acc + p.amount, 0);
  // Math.round is the rule per the brief: drop fractional centavos rather
  // than carry them. Keeps the result an integer.
  return Math.round(total / window.length);
}

import { getForecastForBill, type BillForForecast } from './forecasts';
import type { InferSelectModel } from 'drizzle-orm';
import { bill_payment as billPaymentTable } from '@/db/schema';

type BillPaymentRow = InferSelectModel<typeof billPaymentTable>;

function makeBill(overrides: Partial<BillForForecast> = {}): BillForForecast {
  return {
    auto_forecast: false,
    expected_amount: 159900,
    ...overrides,
  };
}

function makePayment(overrides: Partial<BillPaymentRow> = {}): BillPaymentRow {
  return {
    id: 'p',
    bill_id: 'b',
    wallet_id: 'w',
    amount: 100,
    paid_date: '2026-01-15',
    period: '2026-01',
    note: null,
    created_at: '2026-01-15T08:00:00.000Z',
    updated_at: '2026-01-15T08:00:00.000Z',
    ...overrides,
  };
}

describe('getForecastForBill', () => {
  it('returns expected_amount when auto_forecast is false', () => {
    const bill = makeBill({ auto_forecast: false, expected_amount: 159900 });
    const payments = [
      makePayment({ amount: 200000, period: '2026-03' }),
      makePayment({ amount: 200000, period: '2026-02' }),
      makePayment({ amount: 200000, period: '2026-01' }),
    ];
    expect(getForecastForBill(bill, payments)).toBe(159900);
  });

  it('returns expected_amount when auto_forecast is true but zero payments', () => {
    const bill = makeBill({ auto_forecast: true, expected_amount: 159900 });
    expect(getForecastForBill(bill, [])).toBe(159900);
  });

  it('returns the single payment amount when only one is available', () => {
    const bill = makeBill({ auto_forecast: true, expected_amount: 999999 });
    const payments = [makePayment({ amount: 123456, period: '2026-01' })];
    expect(getForecastForBill(bill, payments)).toBe(123456);
  });

  it('averages exactly three payments', () => {
    const bill = makeBill({ auto_forecast: true });
    const payments = [
      makePayment({ amount: 100, period: '2026-03' }),
      makePayment({ amount: 200, period: '2026-02' }),
      makePayment({ amount: 300, period: '2026-01' }),
    ];
    expect(getForecastForBill(bill, payments)).toBe(200);
  });

  it('uses only the last 3 by period desc when more than 3 are passed', () => {
    const bill = makeBill({ auto_forecast: true });
    // 5 payments. Last 3 by period desc are 2026-05, 2026-04, 2026-03.
    const payments = [
      makePayment({ amount: 1000, period: '2026-01' }),
      makePayment({ amount: 2000, period: '2026-02' }),
      makePayment({ amount: 3000, period: '2026-03' }),
      makePayment({ amount: 4000, period: '2026-04' }),
      makePayment({ amount: 5000, period: '2026-05' }),
    ];
    // (3000 + 4000 + 5000) / 3 = 4000
    expect(getForecastForBill(bill, payments)).toBe(4000);
  });

  it('re-sorts unsorted input defensively', () => {
    const bill = makeBill({ auto_forecast: true });
    const payments = [
      makePayment({ amount: 5000, period: '2026-05' }),
      makePayment({ amount: 1000, period: '2026-01' }),
      makePayment({ amount: 4000, period: '2026-04' }),
      makePayment({ amount: 2000, period: '2026-02' }),
      makePayment({ amount: 3000, period: '2026-03' }),
    ];
    expect(getForecastForBill(bill, payments)).toBe(4000);
  });

  it('rounds the average to the nearest centavo', () => {
    const bill = makeBill({ auto_forecast: true });
    // (100 + 100 + 101) / 3 = 100.333… → rounds to 100
    const payments = [
      makePayment({ amount: 100, period: '2026-03' }),
      makePayment({ amount: 100, period: '2026-02' }),
      makePayment({ amount: 101, period: '2026-01' }),
    ];
    expect(getForecastForBill(bill, payments)).toBe(100);
  });

  it('rounds .5 up', () => {
    const bill = makeBill({ auto_forecast: true });
    // (100 + 101) / 2 = 100.5 → 101 (Math.round rounds .5 toward +∞)
    const payments = [
      makePayment({ amount: 100, period: '2026-02' }),
      makePayment({ amount: 101, period: '2026-01' }),
    ];
    expect(getForecastForBill(bill, payments)).toBe(101);
  });

  it('does not depend on cadence — quarterly bill averages just as monthly', () => {
    const bill = makeBill({ auto_forecast: true });
    const payments = [
      makePayment({ amount: 600000, period: '2026-09' }),
      makePayment({ amount: 700000, period: '2026-06' }),
      makePayment({ amount: 800000, period: '2026-03' }),
    ];
    expect(getForecastForBill(bill, payments)).toBe(700000);
  });
});

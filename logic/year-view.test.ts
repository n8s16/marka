import { describe, expect, test } from '@jest/globals';

import {
  buildMonthSummariesForYear,
  getYearSummary,
  type Bill,
  type BillPayment,
} from './year-view';

function makeBill(overrides: Partial<Bill> = {}): Bill {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'b1',
    name: 'Internet',
    expected_amount: 159900,
    frequency: 'monthly',
    interval_months: null,
    due_day: 15,
    start_period: '2026-01',
    end_period: null,
    default_wallet_id: 'w1',
    reminder_offset_days: 3,
    reminder_time: '08:00',
    auto_forecast: false,
    archived: false,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makePayment(overrides: Partial<BillPayment> = {}): BillPayment {
  const now = '2026-04-15T08:00:00.000Z';
  return {
    id: 'pay1',
    bill_id: 'b1',
    wallet_id: 'w1',
    amount: 200000,
    paid_date: '2026-04-15',
    period: '2026-04',
    note: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function buildPaymentMaps(
  payments: BillPayment[],
): {
  paymentsByBillByPeriod: Map<string, Map<string, BillPayment>>;
  recentPaymentsByBill: Map<string, BillPayment[]>;
} {
  const paymentsByBillByPeriod = new Map<string, Map<string, BillPayment>>();
  const grouped = new Map<string, BillPayment[]>();
  for (const p of payments) {
    let inner = paymentsByBillByPeriod.get(p.bill_id);
    if (!inner) {
      inner = new Map();
      paymentsByBillByPeriod.set(p.bill_id, inner);
    }
    inner.set(p.period, p);

    const arr = grouped.get(p.bill_id);
    if (arr) arr.push(p);
    else grouped.set(p.bill_id, [p]);
  }
  const recentPaymentsByBill = new Map<string, BillPayment[]>();
  for (const [billId, arr] of grouped) {
    recentPaymentsByBill.set(
      billId,
      [...arr].sort((a, b) => b.period.localeCompare(a.period)).slice(0, 3),
    );
  }
  return { paymentsByBillByPeriod, recentPaymentsByBill };
}

describe('buildMonthSummariesForYear', () => {
  test('returns exactly 12 months, January→December', () => {
    const months = buildMonthSummariesForYear(
      2026,
      new Date('2026-04-15T00:00:00'),
      [],
      new Map(),
      new Map(),
    );
    expect(months).toHaveLength(12);
    expect(months[0].period).toBe('2026-01');
    expect(months[0].monthIndex).toBe(0);
    expect(months[11].period).toBe('2026-12');
    expect(months[11].monthIndex).toBe(11);
  });

  test('flags current month and future months relative to today', () => {
    const months = buildMonthSummariesForYear(
      2026,
      new Date('2026-04-15T00:00:00'),
      [],
      new Map(),
      new Map(),
    );
    expect(months[0].isCurrentMonth).toBe(false); // Jan
    expect(months[3].isCurrentMonth).toBe(true); // Apr
    expect(months[3].isFutureMonth).toBe(false);
    expect(months[4].isFutureMonth).toBe(true); // May+
    expect(months[11].isFutureMonth).toBe(true);
  });

  test('months in a past year have no current/future flags set', () => {
    const months = buildMonthSummariesForYear(
      2025,
      new Date('2026-04-15T00:00:00'),
      [],
      new Map(),
      new Map(),
    );
    expect(months.every((m) => !m.isCurrentMonth)).toBe(true);
    expect(months.every((m) => !m.isFutureMonth)).toBe(true);
  });

  test('months in a future year are all flagged future', () => {
    const months = buildMonthSummariesForYear(
      2027,
      new Date('2026-04-15T00:00:00'),
      [],
      new Map(),
      new Map(),
    );
    expect(months.every((m) => m.isFutureMonth)).toBe(true);
    expect(months.every((m) => !m.isCurrentMonth)).toBe(true);
  });

  test('paid bill rolls into totalPaid + paidCount, no upcoming', () => {
    const bill = makeBill({ due_day: 5 });
    const payment = makePayment({
      bill_id: bill.id,
      period: '2026-04',
      amount: 199900,
    });
    const maps = buildPaymentMaps([payment]);
    const months = buildMonthSummariesForYear(
      2026,
      new Date('2026-04-20T00:00:00'),
      [bill],
      maps.paymentsByBillByPeriod,
      maps.recentPaymentsByBill,
    );
    const april = months[3];
    expect(april.totalPaid).toBe(199900);
    expect(april.paidCount).toBe(1);
    expect(april.totalBillsDue).toBe(1);
    expect(april.upcomingAmount).toBe(0);
    expect(april.cells).toHaveLength(1);
    expect(april.cells[0].status.kind).toBe('paid');
  });

  test('unpaid past bill flags as overdue (with forecast)', () => {
    const bill = makeBill({ due_day: 5, expected_amount: 199900 });
    const months = buildMonthSummariesForYear(
      2026,
      new Date('2026-04-20T00:00:00'),
      [bill],
      new Map(),
      new Map(),
    );
    const april = months[3];
    expect(april.cells).toHaveLength(1);
    expect(april.cells[0].status.kind).toBe('overdue');
    expect(april.upcomingAmount).toBe(199900);
  });

  test('unpaid future bill flags as upcoming', () => {
    const bill = makeBill({ due_day: 25, expected_amount: 159900 });
    const months = buildMonthSummariesForYear(
      2026,
      new Date('2026-04-15T00:00:00'),
      [bill],
      new Map(),
      new Map(),
    );
    const april = months[3];
    expect(april.cells).toHaveLength(1);
    expect(april.cells[0].status.kind).toBe('upcoming');
    expect(april.upcomingAmount).toBe(159900);
  });

  test('due_day past the end of a short month clamps to the last day', () => {
    // Bill due on 31st, February has 28 days in 2026
    const bill = makeBill({ due_day: 31 });
    const months = buildMonthSummariesForYear(
      2026,
      new Date('2026-04-15T00:00:00'),
      [bill],
      new Map(),
      new Map(),
    );
    const feb = months[1];
    expect(feb.cells).toHaveLength(1);
    expect(feb.cells[0].dueDay).toBe(28);
  });

  test('quarterly bill renders only on its due-months', () => {
    const bill = makeBill({
      frequency: 'quarterly',
      due_day: 10,
      start_period: '2026-01',
    });
    const months = buildMonthSummariesForYear(
      2026,
      new Date('2026-04-15T00:00:00'),
      [bill],
      new Map(),
      new Map(),
    );
    // Jan, Apr, Jul, Oct due
    const dueIndexes = months
      .map((m, i) => (m.totalBillsDue > 0 ? i : null))
      .filter((i): i is number => i !== null);
    expect(dueIndexes).toEqual([0, 3, 6, 9]);
  });

  test('cells sort by dueDay asc, then bill name asc on tie', () => {
    const a = makeBill({ id: 'a', name: 'Zebra', due_day: 5 });
    const b = makeBill({ id: 'b', name: 'Apple', due_day: 5 });
    const c = makeBill({ id: 'c', name: 'Banana', due_day: 1 });
    const months = buildMonthSummariesForYear(
      2026,
      new Date('2026-04-15T00:00:00'),
      [a, b, c],
      new Map(),
      new Map(),
    );
    const april = months[3];
    expect(april.cells.map((cell) => cell.bill.name)).toEqual([
      'Banana', // day 1
      'Apple',  // day 5 (alphabetically first among same-day)
      'Zebra',  // day 5
    ]);
  });

  test('archived-but-still-rendered: caller filters; logic does not', () => {
    // Passing an archived bill — function still renders it. The screen's
    // hook is responsible for excluding archived bills before calling.
    const bill = makeBill({ archived: true });
    const months = buildMonthSummariesForYear(
      2026,
      new Date('2026-04-15T00:00:00'),
      [bill],
      new Map(),
      new Map(),
    );
    expect(months[3].totalBillsDue).toBe(1);
  });

  test('auto_forecast: averages last-3 payments for upcoming amount', () => {
    const bill = makeBill({
      due_day: 25,
      auto_forecast: true,
      expected_amount: 100000, // ignored when auto_forecast and history exists
    });
    const past = [
      makePayment({ id: 'p1', period: '2026-01', amount: 100000 }),
      makePayment({ id: 'p2', period: '2026-02', amount: 200000 }),
      makePayment({ id: 'p3', period: '2026-03', amount: 300000 }),
    ];
    const maps = buildPaymentMaps(past);
    const months = buildMonthSummariesForYear(
      2026,
      new Date('2026-04-15T00:00:00'),
      [bill],
      maps.paymentsByBillByPeriod,
      maps.recentPaymentsByBill,
    );
    const april = months[3];
    expect(april.upcomingAmount).toBe(200000); // (100k+200k+300k)/3
  });
});

describe('getYearSummary', () => {
  test('aggregates across 12 months', () => {
    const bill = makeBill({ due_day: 10 });
    const paid = makePayment({ period: '2026-04', amount: 199900 });
    const unpaid = makeBill({ id: 'b2', name: 'Other', due_day: 20 });
    const maps = buildPaymentMaps([paid]);
    const months = buildMonthSummariesForYear(
      2026,
      new Date('2026-04-15T00:00:00'),
      [bill, unpaid],
      maps.paymentsByBillByPeriod,
      maps.recentPaymentsByBill,
    );
    const summary = getYearSummary(2026, new Date('2026-04-15T00:00:00'), months);
    expect(summary.isCurrent).toBe(true);
    expect(summary.isPast).toBe(false);
    expect(summary.totalPaid).toBe(199900);
    expect(summary.paidCount).toBe(1);
    // monthly bills × 12 months × 2 bills = 24
    expect(summary.totalBillsDue).toBe(24);
  });

  test('past year flags isPast and not isCurrent', () => {
    const summary = getYearSummary(2025, new Date('2026-04-15T00:00:00'), []);
    expect(summary.isPast).toBe(true);
    expect(summary.isCurrent).toBe(false);
  });

  test('future year flags neither past nor current', () => {
    const summary = getYearSummary(2027, new Date('2026-04-15T00:00:00'), []);
    expect(summary.isPast).toBe(false);
    expect(summary.isCurrent).toBe(false);
  });
});

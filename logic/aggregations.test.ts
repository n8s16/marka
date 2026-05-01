import {
  getMonthlyOutflowTotal,
  getMonthlyOutflowByWallet,
  type BillPayment,
  type Expense,
} from './aggregations';

function makePayment(overrides: Partial<BillPayment> = {}): BillPayment {
  return {
    id: 'p',
    bill_id: 'b',
    wallet_id: 'w-maya',
    amount: 159900,
    paid_date: '2026-04-15',
    period: '2026-04',
    note: null,
    created_at: '2026-04-15T08:00:00.000Z',
    updated_at: '2026-04-15T08:00:00.000Z',
    ...overrides,
  };
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e',
    description: 'Coffee',
    amount: 15000,
    category_id: 'c-food',
    wallet_id: 'w-maya',
    date: '2026-04-10',
    note: null,
    created_at: '2026-04-10T08:00:00.000Z',
    updated_at: '2026-04-10T08:00:00.000Z',
    ...overrides,
  };
}

describe('getMonthlyOutflowTotal', () => {
  it('returns zeros for empty arrays', () => {
    expect(getMonthlyOutflowTotal([], [], '2026-04')).toEqual({
      bills: 0,
      spending: 0,
      total: 0,
    });
  });

  it('sums a single bill payment in the period', () => {
    const payments = [makePayment({ amount: 159900, paid_date: '2026-04-15' })];
    expect(getMonthlyOutflowTotal(payments, [], '2026-04')).toEqual({
      bills: 159900,
      spending: 0,
      total: 159900,
    });
  });

  it('sums a single expense in the period', () => {
    const expenses = [makeExpense({ amount: 25000, date: '2026-04-03' })];
    expect(getMonthlyOutflowTotal([], expenses, '2026-04')).toEqual({
      bills: 0,
      spending: 25000,
      total: 25000,
    });
  });

  it('sums bills and expenses together in the same period', () => {
    const payments = [
      makePayment({ amount: 100000, paid_date: '2026-04-01' }),
      makePayment({ amount: 50000, paid_date: '2026-04-20' }),
    ];
    const expenses = [
      makeExpense({ amount: 30000, date: '2026-04-05' }),
      makeExpense({ amount: 7000, date: '2026-04-25' }),
    ];
    expect(getMonthlyOutflowTotal(payments, expenses, '2026-04')).toEqual({
      bills: 150000,
      spending: 37000,
      total: 187000,
    });
  });

  it('excludes a payment outside the period', () => {
    const payments = [makePayment({ amount: 159900, paid_date: '2026-03-31' })];
    expect(getMonthlyOutflowTotal(payments, [], '2026-04')).toEqual({
      bills: 0,
      spending: 0,
      total: 0,
    });
  });

  it('excludes events outside the period in a mixed set', () => {
    const payments = [
      makePayment({ id: 'p1', amount: 100000, paid_date: '2026-04-15' }),
      makePayment({ id: 'p2', amount: 999999, paid_date: '2026-03-15' }), // out
      makePayment({ id: 'p3', amount: 999999, paid_date: '2026-05-01' }), // out
    ];
    const expenses = [
      makeExpense({ id: 'e1', amount: 20000, date: '2026-04-10' }),
      makeExpense({ id: 'e2', amount: 999999, date: '2025-04-10' }), // out (year)
    ];
    expect(getMonthlyOutflowTotal(payments, expenses, '2026-04')).toEqual({
      bills: 100000,
      spending: 20000,
      total: 120000,
    });
  });

  it('treats expense with null amount as 0 without crashing', () => {
    const expenses = [
      makeExpense({ id: 'e1', amount: null, date: '2026-04-10' }),
      makeExpense({ id: 'e2', amount: 5000, date: '2026-04-11' }),
    ];
    expect(getMonthlyOutflowTotal([], expenses, '2026-04')).toEqual({
      bills: 0,
      spending: 5000,
      total: 5000,
    });
  });

  it('includes events on the first and last day of the month', () => {
    const payments = [
      makePayment({ id: 'p1', amount: 100, paid_date: '2026-04-01' }),
      makePayment({ id: 'p2', amount: 200, paid_date: '2026-04-30' }),
    ];
    const expenses = [
      makeExpense({ id: 'e1', amount: 10, date: '2026-04-01' }),
      makeExpense({ id: 'e2', amount: 20, date: '2026-04-30' }),
    ];
    expect(getMonthlyOutflowTotal(payments, expenses, '2026-04')).toEqual({
      bills: 300,
      spending: 30,
      total: 330,
    });
  });

  it('excludes the first day of the next month', () => {
    const payments = [makePayment({ amount: 999999, paid_date: '2026-05-01' })];
    const expenses = [makeExpense({ amount: 999999, date: '2026-05-01' })];
    expect(getMonthlyOutflowTotal(payments, expenses, '2026-04')).toEqual({
      bills: 0,
      spending: 0,
      total: 0,
    });
  });

  it('handles February correctly across leap and non-leap years', () => {
    // 2024 is a leap year (Feb 29 valid). 2026 is not (Feb 29 would be invalid).
    const payments2024 = [
      makePayment({ amount: 100, paid_date: '2024-02-29' }), // valid leap day
    ];
    expect(getMonthlyOutflowTotal(payments2024, [], '2024-02')).toEqual({
      bills: 100,
      spending: 0,
      total: 100,
    });

    // For non-leap year, Feb 28 is the last day; ensure it's included.
    const payments2026 = [makePayment({ amount: 100, paid_date: '2026-02-28' })];
    expect(getMonthlyOutflowTotal(payments2026, [], '2026-02')).toEqual({
      bills: 100,
      spending: 0,
      total: 100,
    });
  });

  it('uses paid_date (not period) for BillPayment filtering', () => {
    // Period is April but paid in May → counts toward May, not April.
    const payment = makePayment({
      amount: 100000,
      period: '2026-04',
      paid_date: '2026-05-02',
    });
    expect(getMonthlyOutflowTotal([payment], [], '2026-04')).toEqual({
      bills: 0,
      spending: 0,
      total: 0,
    });
    expect(getMonthlyOutflowTotal([payment], [], '2026-05')).toEqual({
      bills: 100000,
      spending: 0,
      total: 100000,
    });
  });

  it('throws on malformed period strings', () => {
    expect(() => getMonthlyOutflowTotal([], [], '2026-4')).toThrow(/Invalid period/);
    expect(() => getMonthlyOutflowTotal([], [], '2026-13')).toThrow(/Invalid period/);
    expect(() => getMonthlyOutflowTotal([], [], 'abc')).toThrow(/Invalid period/);
    expect(() => getMonthlyOutflowTotal([], [], '')).toThrow(/Invalid period/);
    expect(() => getMonthlyOutflowTotal([], [], '2026-04-01')).toThrow(
      /Invalid period/,
    );
  });
});

describe('getMonthlyOutflowByWallet', () => {
  it('returns an empty Map for empty arrays', () => {
    const result = getMonthlyOutflowByWallet([], [], '2026-04');
    expect(result.size).toBe(0);
  });

  it('groups a single payment under its wallet', () => {
    const payments = [
      makePayment({ wallet_id: 'w-maya', amount: 159900, paid_date: '2026-04-15' }),
    ];
    const result = getMonthlyOutflowByWallet(payments, [], '2026-04');
    expect(result.size).toBe(1);
    expect(result.get('w-maya')).toEqual({
      bills: 159900,
      spending: 0,
      total: 159900,
    });
  });

  it('groups a single expense under its wallet', () => {
    const expenses = [
      makeExpense({ wallet_id: 'w-gcash', amount: 30000, date: '2026-04-10' }),
    ];
    const result = getMonthlyOutflowByWallet([], expenses, '2026-04');
    expect(result.size).toBe(1);
    expect(result.get('w-gcash')).toEqual({
      bills: 0,
      spending: 30000,
      total: 30000,
    });
  });

  it('groups bills and expenses for the same wallet into one entry', () => {
    const payments = [
      makePayment({ wallet_id: 'w-maya', amount: 100000, paid_date: '2026-04-01' }),
    ];
    const expenses = [
      makeExpense({ wallet_id: 'w-maya', amount: 25000, date: '2026-04-05' }),
    ];
    const result = getMonthlyOutflowByWallet(payments, expenses, '2026-04');
    expect(result.size).toBe(1);
    expect(result.get('w-maya')).toEqual({
      bills: 100000,
      spending: 25000,
      total: 125000,
    });
  });

  it('groups events across multiple wallets', () => {
    const payments = [
      makePayment({
        id: 'p1',
        wallet_id: 'w-maya',
        amount: 100000,
        paid_date: '2026-04-15',
      }),
      makePayment({
        id: 'p2',
        wallet_id: 'w-union',
        amount: 250000,
        paid_date: '2026-04-20',
      }),
    ];
    const expenses = [
      makeExpense({
        id: 'e1',
        wallet_id: 'w-gcash',
        amount: 15000,
        date: '2026-04-03',
      }),
      makeExpense({
        id: 'e2',
        wallet_id: 'w-maya',
        amount: 5000,
        date: '2026-04-04',
      }),
    ];
    const result = getMonthlyOutflowByWallet(payments, expenses, '2026-04');

    expect(result.size).toBe(3);
    expect(result.get('w-maya')).toEqual({
      bills: 100000,
      spending: 5000,
      total: 105000,
    });
    expect(result.get('w-union')).toEqual({
      bills: 250000,
      spending: 0,
      total: 250000,
    });
    expect(result.get('w-gcash')).toEqual({
      bills: 0,
      spending: 15000,
      total: 15000,
    });
  });

  it('excludes out-of-period events from per-wallet sums', () => {
    const payments = [
      makePayment({
        id: 'p1',
        wallet_id: 'w-maya',
        amount: 100000,
        paid_date: '2026-04-10',
      }),
      makePayment({
        id: 'p2',
        wallet_id: 'w-maya',
        amount: 999999,
        paid_date: '2026-03-10', // out of period
      }),
    ];
    const expenses = [
      makeExpense({
        id: 'e1',
        wallet_id: 'w-gcash',
        amount: 999999,
        date: '2026-05-01', // out of period
      }),
    ];
    const result = getMonthlyOutflowByWallet(payments, expenses, '2026-04');
    expect(result.size).toBe(1);
    expect(result.get('w-maya')).toEqual({
      bills: 100000,
      spending: 0,
      total: 100000,
    });
    expect(result.has('w-gcash')).toBe(false);
  });

  it('does not include wallets that have only out-of-period activity', () => {
    const payments = [
      makePayment({
        wallet_id: 'w-cash',
        amount: 100000,
        paid_date: '2026-03-15',
      }),
    ];
    const result = getMonthlyOutflowByWallet(payments, [], '2026-04');
    expect(result.size).toBe(0);
    expect(result.has('w-cash')).toBe(false);
  });

  it('skips expenses with null amount per-wallet', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        wallet_id: 'w-maya',
        amount: null,
        date: '2026-04-10',
      }),
      makeExpense({
        id: 'e2',
        wallet_id: 'w-maya',
        amount: 5000,
        date: '2026-04-11',
      }),
    ];
    const result = getMonthlyOutflowByWallet([], expenses, '2026-04');
    expect(result.get('w-maya')).toEqual({
      bills: 0,
      spending: 5000,
      total: 5000,
    });
  });

  it('throws on malformed period strings', () => {
    expect(() => getMonthlyOutflowByWallet([], [], '2026-4')).toThrow(
      /Invalid period/,
    );
    expect(() => getMonthlyOutflowByWallet([], [], 'not-a-period')).toThrow(
      /Invalid period/,
    );
  });
});

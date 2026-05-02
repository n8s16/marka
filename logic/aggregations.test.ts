import {
  getMonthlyOutflowTotal,
  getMonthlyOutflowByWallet,
  getMonthlyOutflowByCategory,
  getMultiMonthOutflowTrend,
  getMultiMonthOutflowByWallet,
  getCategoryAnomalies,
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

describe('getMonthlyOutflowByCategory', () => {
  it('returns an empty Map for empty expenses', () => {
    const result = getMonthlyOutflowByCategory([], '2026-04');
    expect(result.size).toBe(0);
  });

  it('groups a single expense under its category', () => {
    const expenses = [
      makeExpense({ category_id: 'c-food', amount: 25000, date: '2026-04-10' }),
    ];
    const result = getMonthlyOutflowByCategory(expenses, '2026-04');
    expect(result.size).toBe(1);
    expect(result.get('c-food')).toBe(25000);
  });

  it('sums multiple expenses across multiple categories correctly', () => {
    const expenses = [
      makeExpense({ id: 'e1', category_id: 'c-food', amount: 25000, date: '2026-04-01' }),
      makeExpense({ id: 'e2', category_id: 'c-food', amount: 5000, date: '2026-04-15' }),
      makeExpense({ id: 'e3', category_id: 'c-tech', amount: 999900, date: '2026-04-20' }),
      makeExpense({ id: 'e4', category_id: 'c-transport', amount: 12000, date: '2026-04-30' }),
    ];
    const result = getMonthlyOutflowByCategory(expenses, '2026-04');
    expect(result.size).toBe(3);
    expect(result.get('c-food')).toBe(30000);
    expect(result.get('c-tech')).toBe(999900);
    expect(result.get('c-transport')).toBe(12000);
  });

  it('excludes expenses outside the period', () => {
    const expenses = [
      makeExpense({ id: 'e1', category_id: 'c-food', amount: 25000, date: '2026-04-10' }),
      makeExpense({ id: 'e2', category_id: 'c-food', amount: 999999, date: '2026-03-31' }),
      makeExpense({ id: 'e3', category_id: 'c-food', amount: 999999, date: '2026-05-01' }),
      makeExpense({ id: 'e4', category_id: 'c-tech', amount: 999999, date: '2025-04-10' }),
    ];
    const result = getMonthlyOutflowByCategory(expenses, '2026-04');
    expect(result.size).toBe(1);
    expect(result.get('c-food')).toBe(25000);
    expect(result.has('c-tech')).toBe(false);
  });

  it('treats null-amount expense as 0 contribution', () => {
    const expenses = [
      makeExpense({ id: 'e1', category_id: 'c-food', amount: null, date: '2026-04-05' }),
      makeExpense({ id: 'e2', category_id: 'c-food', amount: 5000, date: '2026-04-06' }),
    ];
    const result = getMonthlyOutflowByCategory(expenses, '2026-04');
    expect(result.get('c-food')).toBe(5000);
  });

  it('does not key categories whose only in-period expense is null-amount', () => {
    const expenses = [
      makeExpense({ id: 'e1', category_id: 'c-misc', amount: null, date: '2026-04-05' }),
    ];
    const result = getMonthlyOutflowByCategory(expenses, '2026-04');
    expect(result.has('c-misc')).toBe(false);
    expect(result.size).toBe(0);
  });

  it('throws on malformed period strings', () => {
    expect(() => getMonthlyOutflowByCategory([], '2026-4')).toThrow(/Invalid period/);
    expect(() => getMonthlyOutflowByCategory([], '')).toThrow(/Invalid period/);
  });
});

describe('getMultiMonthOutflowTrend', () => {
  it('returns an empty array for empty periods', () => {
    expect(getMultiMonthOutflowTrend([], [], [])).toEqual([]);
  });

  it('returns one point with correct totals for a single period', () => {
    const payments = [makePayment({ amount: 100000, paid_date: '2026-04-15' })];
    const expenses = [makeExpense({ amount: 25000, date: '2026-04-05' })];
    const result = getMultiMonthOutflowTrend(payments, expenses, ['2026-04']);
    expect(result).toEqual([
      { period: '2026-04', bills: 100000, spending: 25000, total: 125000 },
    ]);
  });

  it('emits a zero-filled point for periods with no activity', () => {
    const payments = [makePayment({ amount: 100000, paid_date: '2026-04-15' })];
    const result = getMultiMonthOutflowTrend(payments, [], ['2026-03', '2026-04', '2026-05']);
    expect(result).toEqual([
      { period: '2026-03', bills: 0, spending: 0, total: 0 },
      { period: '2026-04', bills: 100000, spending: 0, total: 100000 },
      { period: '2026-05', bills: 0, spending: 0, total: 0 },
    ]);
  });

  it('preserves the input period order even when not chronological', () => {
    const expenses = [
      makeExpense({ id: 'e1', amount: 1000, date: '2026-02-10' }),
      makeExpense({ id: 'e2', amount: 2000, date: '2026-03-10' }),
      makeExpense({ id: 'e3', amount: 3000, date: '2026-04-10' }),
    ];
    const result = getMultiMonthOutflowTrend([], expenses, ['2026-04', '2026-02', '2026-03']);
    expect(result.map((p) => p.period)).toEqual(['2026-04', '2026-02', '2026-03']);
    expect(result.map((p) => p.spending)).toEqual([3000, 1000, 2000]);
  });

  it('matches getMonthlyOutflowTotal per-period (no new logic)', () => {
    const payments = [
      makePayment({ id: 'p1', amount: 100000, paid_date: '2026-03-15' }),
      makePayment({ id: 'p2', amount: 50000, paid_date: '2026-04-20' }),
    ];
    const expenses = [
      makeExpense({ id: 'e1', amount: 7500, date: '2026-03-05' }),
      makeExpense({ id: 'e2', amount: 12500, date: '2026-04-05' }),
    ];
    const result = getMultiMonthOutflowTrend(payments, expenses, ['2026-03', '2026-04']);
    expect(result).toEqual([
      { period: '2026-03', bills: 100000, spending: 7500, total: 107500 },
      { period: '2026-04', bills: 50000, spending: 12500, total: 62500 },
    ]);
  });
});

describe('getMultiMonthOutflowByWallet', () => {
  it('returns an empty array for empty periods', () => {
    expect(getMultiMonthOutflowByWallet([], [], [])).toEqual([]);
  });

  it('returns one entry per period in input order with sparse byWallet maps', () => {
    const payments = [
      makePayment({ id: 'p1', wallet_id: 'w-maya', amount: 100000, paid_date: '2026-04-15' }),
      makePayment({ id: 'p2', wallet_id: 'w-gcash', amount: 50000, paid_date: '2026-04-20' }),
    ];
    const expenses = [
      makeExpense({ id: 'e1', wallet_id: 'w-maya', amount: 25000, date: '2026-04-05' }),
    ];
    const result = getMultiMonthOutflowByWallet(payments, expenses, ['2026-04']);
    expect(result).toHaveLength(1);
    expect(result[0].period).toBe('2026-04');
    expect(result[0].byWallet.get('w-maya')).toBe(125000); // 100k bills + 25k spending
    expect(result[0].byWallet.get('w-gcash')).toBe(50000);
    expect(result[0].byWallet.has('w-unionbank')).toBe(false); // sparse
  });

  it('emits an empty byWallet map for periods with no activity', () => {
    const payments = [makePayment({ amount: 100000, paid_date: '2026-04-15' })];
    const result = getMultiMonthOutflowByWallet(payments, [], ['2026-03', '2026-04', '2026-05']);
    expect(result.map((p) => p.byWallet.size)).toEqual([0, 1, 0]);
  });

  it('excludes wallets with zero outflow in a given period', () => {
    const payments = [
      makePayment({ id: 'p1', wallet_id: 'w-maya', amount: 100000, paid_date: '2026-03-15' }),
      makePayment({ id: 'p2', wallet_id: 'w-gcash', amount: 50000, paid_date: '2026-04-15' }),
    ];
    const result = getMultiMonthOutflowByWallet(payments, [], ['2026-03', '2026-04']);
    // March: only Maya. April: only GCash. No bleed-through.
    expect(Array.from(result[0].byWallet.keys())).toEqual(['w-maya']);
    expect(Array.from(result[1].byWallet.keys())).toEqual(['w-gcash']);
  });

  it('preserves input period order', () => {
    const payments = [
      makePayment({ id: 'p1', wallet_id: 'w-maya', amount: 1000, paid_date: '2026-02-10' }),
      makePayment({ id: 'p2', wallet_id: 'w-maya', amount: 2000, paid_date: '2026-03-10' }),
      makePayment({ id: 'p3', wallet_id: 'w-maya', amount: 3000, paid_date: '2026-04-10' }),
    ];
    const result = getMultiMonthOutflowByWallet(payments, [], ['2026-04', '2026-02', '2026-03']);
    expect(result.map((p) => p.period)).toEqual(['2026-04', '2026-02', '2026-03']);
    expect(result.map((p) => p.byWallet.get('w-maya'))).toEqual([3000, 1000, 2000]);
  });

  it('combines bills and expenses per wallet within a period', () => {
    const payments = [
      makePayment({ id: 'p1', wallet_id: 'w-maya', amount: 80000, paid_date: '2026-04-15' }),
    ];
    const expenses = [
      makeExpense({ id: 'e1', wallet_id: 'w-maya', amount: 20000, date: '2026-04-05' }),
      makeExpense({ id: 'e2', wallet_id: 'w-maya', amount: 5000, date: '2026-04-25' }),
    ];
    const result = getMultiMonthOutflowByWallet(payments, expenses, ['2026-04']);
    expect(result[0].byWallet.get('w-maya')).toBe(105000); // 80k + 20k + 5k
  });
});

describe('getCategoryAnomalies', () => {
  // Helper: spread `total` evenly across the given `period` so a category has
  // a consistent historical baseline. Each call adds one expense in the
  // specified period for `categoryId`.
  function expenseAt(
    id: string,
    categoryId: string,
    period: string,
    amount: number,
  ): Expense {
    return makeExpense({
      id,
      category_id: categoryId,
      amount,
      date: `${period}-15`,
    });
  }

  it('returns an empty array for empty expenses', () => {
    expect(getCategoryAnomalies([], '2026-04', 3)).toEqual([]);
  });

  it('returns an empty array when all categories are below threshold', () => {
    // Tech: ~10000 historical, 11000 current → ratio 1.1 < 1.5
    const expenses = [
      expenseAt('h1', 'c-tech', '2026-01', 10000),
      expenseAt('h2', 'c-tech', '2026-02', 10000),
      expenseAt('h3', 'c-tech', '2026-03', 10000),
      expenseAt('cur', 'c-tech', '2026-04', 11000),
    ];
    expect(getCategoryAnomalies(expenses, '2026-04', 3)).toEqual([]);
  });

  it('flags a category 2x above its 3-month rolling average', () => {
    // Avg of 10000 across 3 months = 10000. Current 20000 → ratio 2.0
    const expenses = [
      expenseAt('h1', 'c-tech', '2026-01', 10000),
      expenseAt('h2', 'c-tech', '2026-02', 10000),
      expenseAt('h3', 'c-tech', '2026-03', 10000),
      expenseAt('cur', 'c-tech', '2026-04', 20000),
    ];
    const result = getCategoryAnomalies(expenses, '2026-04', 3);
    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe('c-tech');
    expect(result[0].currentAmount).toBe(20000);
    expect(result[0].rollingAverage).toBe(10000);
    expect(result[0].ratio).toBeCloseTo(2.0, 5);
  });

  it('sorts multiple anomalies by ratio descending', () => {
    const expenses = [
      // Tech: avg 10000, current 30000 → ratio 3.0
      expenseAt('t1', 'c-tech', '2026-01', 10000),
      expenseAt('t2', 'c-tech', '2026-02', 10000),
      expenseAt('t3', 'c-tech', '2026-03', 10000),
      expenseAt('tc', 'c-tech', '2026-04', 30000),
      // Food: avg 5000, current 10000 → ratio 2.0
      expenseAt('f1', 'c-food', '2026-01', 5000),
      expenseAt('f2', 'c-food', '2026-02', 5000),
      expenseAt('f3', 'c-food', '2026-03', 5000),
      expenseAt('fc', 'c-food', '2026-04', 10000),
      // Transport: avg 2000, current 4000 → ratio 2.0
      expenseAt('tr1', 'c-transport', '2026-01', 2000),
      expenseAt('tr2', 'c-transport', '2026-02', 2000),
      expenseAt('tr3', 'c-transport', '2026-03', 2000),
      expenseAt('trc', 'c-transport', '2026-04', 4000),
    ];
    const result = getCategoryAnomalies(expenses, '2026-04', 3);
    expect(result).toHaveLength(3);
    expect(result[0].categoryId).toBe('c-tech');
    // Food and Transport tie on ratio; sort is stable enough that both come after Tech.
    expect(result.map((r) => r.categoryId).slice(0, 1)).toEqual(['c-tech']);
    expect(result.slice(1).map((r) => r.categoryId).sort()).toEqual([
      'c-food',
      'c-transport',
    ]);
  });

  it('skips a category with insufficient history (less than half the lookback)', () => {
    // Lookback 3 → minNonZero = ceil(3/2) = 2. Only 1 non-zero historical month → skip.
    const expenses = [
      expenseAt('h1', 'c-tech', '2026-03', 10000), // only 1 historical non-zero month
      expenseAt('cur', 'c-tech', '2026-04', 50000),
    ];
    expect(getCategoryAnomalies(expenses, '2026-04', 3)).toEqual([]);
  });

  it('skips categories with zero current spending', () => {
    const expenses = [
      expenseAt('h1', 'c-tech', '2026-01', 10000),
      expenseAt('h2', 'c-tech', '2026-02', 10000),
      expenseAt('h3', 'c-tech', '2026-03', 10000),
      // Current period: an unrelated category, plus a tech expense with null amount
      // (which contributes 0 and therefore doesn't make tech "current-non-zero").
      makeExpense({
        id: 'null-tech',
        category_id: 'c-tech',
        amount: null,
        date: '2026-04-15',
      }),
      expenseAt('food-cur', 'c-food', '2026-04', 100), // food has no history → also skipped
    ];
    expect(getCategoryAnomalies(expenses, '2026-04', 3)).toEqual([]);
  });

  it('skips categories with zero rolling average even when current is non-zero', () => {
    // Category appears only in the current period — no historical non-zero months.
    // The insufficient-history rule (< minNonZeroPeriods) catches this case so we
    // don't divide by zero or flag a "spike from nothing."
    const expenses = [
      expenseAt('cur', 'c-shopping', '2026-04', 99999),
    ];
    expect(getCategoryAnomalies(expenses, '2026-04', 3)).toEqual([]);
  });

  it('respects the default threshold of 1.5 (excludes 1.4x, includes 1.5x)', () => {
    // Two categories, one at 1.4x (below) and one at 1.5x (at threshold).
    const expenses = [
      // Tech: avg 10000, current 14000 → ratio 1.4 (below default)
      expenseAt('t1', 'c-tech', '2026-01', 10000),
      expenseAt('t2', 'c-tech', '2026-02', 10000),
      expenseAt('t3', 'c-tech', '2026-03', 10000),
      expenseAt('tc', 'c-tech', '2026-04', 14000),
      // Food: avg 10000, current 15000 → ratio 1.5 (at threshold)
      expenseAt('f1', 'c-food', '2026-01', 10000),
      expenseAt('f2', 'c-food', '2026-02', 10000),
      expenseAt('f3', 'c-food', '2026-03', 10000),
      expenseAt('fc', 'c-food', '2026-04', 15000),
    ];
    const result = getCategoryAnomalies(expenses, '2026-04', 3);
    expect(result.map((r) => r.categoryId)).toEqual(['c-food']);
  });

  it('respects a custom threshold (only 2x and above)', () => {
    const expenses = [
      // Tech: avg 10000, current 15000 → ratio 1.5 (excluded at threshold 2.0)
      expenseAt('t1', 'c-tech', '2026-01', 10000),
      expenseAt('t2', 'c-tech', '2026-02', 10000),
      expenseAt('t3', 'c-tech', '2026-03', 10000),
      expenseAt('tc', 'c-tech', '2026-04', 15000),
      // Food: avg 10000, current 25000 → ratio 2.5 (included)
      expenseAt('f1', 'c-food', '2026-01', 10000),
      expenseAt('f2', 'c-food', '2026-02', 10000),
      expenseAt('f3', 'c-food', '2026-03', 10000),
      expenseAt('fc', 'c-food', '2026-04', 25000),
    ];
    const result = getCategoryAnomalies(expenses, '2026-04', 3, 2.0);
    expect(result.map((r) => r.categoryId)).toEqual(['c-food']);
    expect(result[0].ratio).toBeCloseTo(2.5, 5);
  });

  it('honors a custom lookbackMonths and uses ALL months in the window', () => {
    // Lookback 6 months. Avg: (10000*6)/6 = 10000. Current 20000 → ratio 2.0.
    const expenses = [
      expenseAt('h1', 'c-tech', '2025-10', 10000),
      expenseAt('h2', 'c-tech', '2025-11', 10000),
      expenseAt('h3', 'c-tech', '2025-12', 10000),
      expenseAt('h4', 'c-tech', '2026-01', 10000),
      expenseAt('h5', 'c-tech', '2026-02', 10000),
      expenseAt('h6', 'c-tech', '2026-03', 10000),
      // A pre-window historical entry that should NOT be counted.
      expenseAt('hpre', 'c-tech', '2025-09', 999999),
      expenseAt('cur', 'c-tech', '2026-04', 20000),
    ];
    const result = getCategoryAnomalies(expenses, '2026-04', 6);
    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe('c-tech');
    expect(result[0].rollingAverage).toBe(10000);
    expect(result[0].ratio).toBeCloseTo(2.0, 5);
  });

  it('rolling average treats zero-spend months as zero (denominator is full lookback)', () => {
    // 3 months of history, only 2 non-zero. Sum=20000, denominator=3, avg≈6667.
    // Current = 20000 → ratio ≈ 3.0. Passes minNonZeroPeriods=2.
    const expenses = [
      expenseAt('h1', 'c-tech', '2026-01', 10000),
      // 2026-02: gap (no expense → zero for that month)
      expenseAt('h3', 'c-tech', '2026-03', 10000),
      expenseAt('cur', 'c-tech', '2026-04', 20000),
    ];
    const result = getCategoryAnomalies(expenses, '2026-04', 3);
    expect(result).toHaveLength(1);
    expect(result[0].rollingAverage).toBe(Math.round(20000 / 3));
    expect(result[0].ratio).toBeCloseTo(20000 / (20000 / 3), 5);
  });

  it('throws on malformed currentPeriod', () => {
    expect(() => getCategoryAnomalies([], '2026-4', 3)).toThrow(/Invalid period/);
    expect(() => getCategoryAnomalies([], 'nope', 3)).toThrow(/Invalid period/);
  });

  it('throws on non-positive lookbackMonths', () => {
    expect(() => getCategoryAnomalies([], '2026-04', 0)).toThrow(/Invalid lookbackMonths/);
    expect(() => getCategoryAnomalies([], '2026-04', -1)).toThrow(/Invalid lookbackMonths/);
    expect(() => getCategoryAnomalies([], '2026-04', 1.5)).toThrow(/Invalid lookbackMonths/);
  });
});

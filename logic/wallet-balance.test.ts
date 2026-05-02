import {
  getWalletBalance,
  computeOpeningBalance,
  type Wallet,
  type BillPayment,
  type Expense,
  type Transfer,
} from './wallet-balance';

// ─── Inline factories ────────────────────────────────────────────────────────

function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: 'w-maya',
    name: 'Maya',
    color: '#00B14F',
    icon: null,
    type: 'e_wallet',
    show_balance: true,
    opening_balance: 100000,
    archived: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePayment(overrides: Partial<BillPayment> = {}): BillPayment {
  return {
    id: 'p',
    bill_id: 'b',
    wallet_id: 'w-maya',
    amount: 50000,
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

function makeTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: 't',
    from_wallet_id: 'w-maya',
    to_wallet_id: 'w-cash',
    amount: 30000,
    date: '2026-04-12',
    note: null,
    created_at: '2026-04-12T08:00:00.000Z',
    updated_at: '2026-04-12T08:00:00.000Z',
    ...overrides,
  };
}

// ─── getWalletBalance ────────────────────────────────────────────────────────

describe('getWalletBalance', () => {
  it('returns null when show_balance is false (regardless of inputs)', () => {
    const w = makeWallet({ show_balance: false, opening_balance: 100000 });
    const payments = [makePayment({ wallet_id: 'w-maya', amount: 12345 })];
    const expenses = [makeExpense({ wallet_id: 'w-maya', amount: 6789 })];
    const transfers = [makeTransfer({ from_wallet_id: 'w-other', to_wallet_id: 'w-maya', amount: 1 })];

    expect(getWalletBalance(w, payments, expenses, transfers)).toBeNull();
  });

  it('returns null when show_balance is true but opening_balance is null', () => {
    const w = makeWallet({ show_balance: true, opening_balance: null });
    expect(getWalletBalance(w, [], [], [])).toBeNull();
  });

  it('returns 0 when opening_balance is 0 and there are no events', () => {
    const w = makeWallet({ show_balance: true, opening_balance: 0 });
    expect(getWalletBalance(w, [], [], [])).toBe(0);
  });

  it('adds an incoming transfer to the balance', () => {
    const w = makeWallet({ id: 'w-maya', opening_balance: 100000 });
    const transfers = [
      makeTransfer({ from_wallet_id: 'w-cash', to_wallet_id: 'w-maya', amount: 25000 }),
    ];
    expect(getWalletBalance(w, [], [], transfers)).toBe(125000);
  });

  it('subtracts an outgoing transfer from the balance', () => {
    const w = makeWallet({ id: 'w-maya', opening_balance: 100000 });
    const transfers = [
      makeTransfer({ from_wallet_id: 'w-maya', to_wallet_id: 'w-cash', amount: 25000 }),
    ];
    expect(getWalletBalance(w, [], [], transfers)).toBe(75000);
  });

  it('correctly sums opening + bills + expenses + transfers in both directions', () => {
    const w = makeWallet({ id: 'w-maya', opening_balance: 500000 });
    const payments = [
      makePayment({ wallet_id: 'w-maya', amount: 80000 }),  // -80000
      makePayment({ wallet_id: 'w-maya', amount: 20000 }),  // -20000
    ];
    const expenses = [
      makeExpense({ wallet_id: 'w-maya', amount: 15000 }),  // -15000
      makeExpense({ wallet_id: 'w-maya', amount: 5000 }),   //  -5000
    ];
    const transfers = [
      makeTransfer({ from_wallet_id: 'w-maya', to_wallet_id: 'w-cash', amount: 30000 }), // -30000
      makeTransfer({ from_wallet_id: 'w-cash', to_wallet_id: 'w-maya', amount: 10000 }), // +10000
    ];
    // 500000 - 80000 - 20000 - 15000 - 5000 - 30000 + 10000 = 360000
    expect(getWalletBalance(w, payments, expenses, transfers)).toBe(360000);
  });

  it('ignores events for OTHER wallets (defensive in-function filtering)', () => {
    const w = makeWallet({ id: 'w-maya', opening_balance: 100000 });
    const payments = [
      makePayment({ wallet_id: 'w-cash', amount: 50000 }),  // ignored
      makePayment({ wallet_id: 'w-maya', amount: 20000 }),  // -20000
    ];
    const expenses = [
      makeExpense({ wallet_id: 'w-cash', amount: 9999 }),   // ignored
      makeExpense({ wallet_id: 'w-maya', amount: 5000 }),   //  -5000
    ];
    const transfers = [
      // Neither side is w-maya → ignored entirely.
      makeTransfer({ from_wallet_id: 'w-cash', to_wallet_id: 'w-bank', amount: 99999 }),
    ];
    // 100000 - 20000 - 5000 = 75000
    expect(getWalletBalance(w, payments, expenses, transfers)).toBe(75000);
  });

  it('treats expense.amount === null as 0 (no crash)', () => {
    const w = makeWallet({ id: 'w-maya', opening_balance: 100000 });
    const expenses = [
      makeExpense({ wallet_id: 'w-maya', amount: null }),     // contributes 0
      makeExpense({ wallet_id: 'w-maya', amount: 12000 }),    // -12000
    ];
    expect(getWalletBalance(w, [], expenses, [])).toBe(88000);
  });

  it('returns a negative balance when outflows exceed opening balance', () => {
    const w = makeWallet({ id: 'w-maya', opening_balance: 50000 });
    const payments = [makePayment({ wallet_id: 'w-maya', amount: 80000 })];
    const expenses = [makeExpense({ wallet_id: 'w-maya', amount: 15000 })];
    // 50000 - 80000 - 15000 = -45000
    const result = getWalletBalance(w, payments, expenses, []);
    expect(result).toBe(-45000);
    expect(Number.isInteger(result as number)).toBe(true);
  });

  it('does not mutate the input arrays', () => {
    const w = makeWallet({ id: 'w-maya', opening_balance: 100000 });
    const payments = [makePayment({ wallet_id: 'w-maya', amount: 10000 })];
    const expenses = [makeExpense({ wallet_id: 'w-maya', amount: 5000 })];
    const transfers = [
      makeTransfer({ from_wallet_id: 'w-maya', to_wallet_id: 'w-cash', amount: 1000 }),
    ];
    const paymentsCopy = [...payments];
    const expensesCopy = [...expenses];
    const transfersCopy = [...transfers];

    getWalletBalance(w, payments, expenses, transfers);

    expect(payments).toEqual(paymentsCopy);
    expect(expenses).toEqual(expensesCopy);
    expect(transfers).toEqual(transfersCopy);
  });
});

// ─── computeOpeningBalance ───────────────────────────────────────────────────

describe('computeOpeningBalance', () => {
  it('returns the current balance as-is when there are no recorded events', () => {
    expect(computeOpeningBalance('w-maya', 5000, [], [], [])).toBe(5000);
  });

  it('adds recorded outflows (bills + expenses) to the current balance', () => {
    const payments = [
      makePayment({ wallet_id: 'w-maya', amount: 80000 }),
      makePayment({ wallet_id: 'w-maya', amount: 20000 }),
    ];
    const expenses = [makeExpense({ wallet_id: 'w-maya', amount: 15000 })];
    // current 100000 + outflows 115000 - inflows 0 = 215000
    expect(computeOpeningBalance('w-maya', 100000, payments, expenses, [])).toBe(215000);
  });

  it('handles transfers in both directions (subtracts inflows, adds outflows)', () => {
    const transfers = [
      makeTransfer({ from_wallet_id: 'w-maya', to_wallet_id: 'w-cash', amount: 30000 }), // outflow
      makeTransfer({ from_wallet_id: 'w-cash', to_wallet_id: 'w-maya', amount: 10000 }), // inflow
    ];
    // current 100000 + outflows 30000 - inflows 10000 = 120000
    expect(computeOpeningBalance('w-maya', 100000, [], [], transfers)).toBe(120000);
  });

  it('ignores events for OTHER wallets', () => {
    const payments = [makePayment({ wallet_id: 'w-cash', amount: 99999 })];
    const expenses = [makeExpense({ wallet_id: 'w-cash', amount: 1234 })];
    const transfers = [
      makeTransfer({ from_wallet_id: 'w-cash', to_wallet_id: 'w-bank', amount: 50000 }),
    ];
    // None of these touch w-maya → opening_balance == current_balance.
    expect(computeOpeningBalance('w-maya', 50000, payments, expenses, transfers)).toBe(50000);
  });

  it('round-trips: computeOpeningBalance → getWalletBalance returns the original current balance', () => {
    // Mixed activity across all event types and both wallets.
    const payments = [
      makePayment({ wallet_id: 'w-maya', amount: 80000 }),
      makePayment({ wallet_id: 'w-maya', amount: 20000 }),
      makePayment({ wallet_id: 'w-cash', amount: 12345 }),  // ignored
    ];
    const expenses = [
      makeExpense({ wallet_id: 'w-maya', amount: 15000 }),
      makeExpense({ wallet_id: 'w-maya', amount: null }),    // contributes 0
      makeExpense({ wallet_id: 'w-cash', amount: 5000 }),    // ignored
    ];
    const transfers = [
      makeTransfer({ from_wallet_id: 'w-maya', to_wallet_id: 'w-cash', amount: 30000 }),
      makeTransfer({ from_wallet_id: 'w-cash', to_wallet_id: 'w-maya', amount: 10000 }),
    ];

    const reportedCurrentBalance = 250000;
    const opening = computeOpeningBalance(
      'w-maya',
      reportedCurrentBalance,
      payments,
      expenses,
      transfers,
    );

    const w = makeWallet({
      id: 'w-maya',
      show_balance: true,
      opening_balance: opening,
    });

    expect(getWalletBalance(w, payments, expenses, transfers)).toBe(reportedCurrentBalance);
  });

  it('does not mutate the input arrays', () => {
    const payments = [makePayment({ wallet_id: 'w-maya', amount: 10000 })];
    const expenses = [makeExpense({ wallet_id: 'w-maya', amount: 5000 })];
    const transfers = [
      makeTransfer({ from_wallet_id: 'w-maya', to_wallet_id: 'w-cash', amount: 1000 }),
    ];
    const paymentsCopy = [...payments];
    const expensesCopy = [...expenses];
    const transfersCopy = [...transfers];

    computeOpeningBalance('w-maya', 100000, payments, expenses, transfers);

    expect(payments).toEqual(paymentsCopy);
    expect(expenses).toEqual(expensesCopy);
    expect(transfers).toEqual(transfersCopy);
  });
});

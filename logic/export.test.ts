import {
  exportToCsv,
  exportToJson,
  type ExportSnapshot,
} from './export';

import type { Wallet } from '@/db/queries/wallets';
import type { Bill } from '@/db/queries/bills';
import type { Category } from '@/db/queries/categories';
import type { BillPayment } from '@/db/queries/bill-payments';
import type { Expense } from '@/db/queries/expenses';
import type { Transfer } from '@/db/queries/transfers';

// Factory for the empty baseline snapshot used by most tests. Individual
// tests populate just the table they care about.
function makeSnapshot(overrides: Partial<ExportSnapshot> = {}): ExportSnapshot {
  return {
    exportedAt: '2026-05-01T08:00:00.000Z',
    schemaVersion: 1,
    wallet: [],
    bill: [],
    category: [],
    bill_payment: [],
    expense: [],
    transfer: [],
    ...overrides,
  };
}

function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: 'w-1',
    name: 'Maya',
    color: '#00B14F',
    icon: null,
    type: 'e_wallet',
    show_balance: false,
    opening_balance: null,
    archived: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'b-1',
    name: 'Internet',
    expected_amount: 159900,
    frequency: 'monthly',
    interval_months: null,
    due_day: 15,
    start_period: '2026-01',
    default_wallet_id: 'w-1',
    reminder_offset_days: 3,
    reminder_time: '08:00',
    auto_forecast: false,
    archived: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'c-1',
    name: 'Food',
    icon: null,
    archived: false,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeBillPayment(overrides: Partial<BillPayment> = {}): BillPayment {
  return {
    id: 'p-1',
    bill_id: 'b-1',
    wallet_id: 'w-1',
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
    id: 'e-1',
    description: 'Coffee',
    amount: 15000,
    category_id: 'c-1',
    wallet_id: 'w-1',
    date: '2026-04-10',
    note: null,
    created_at: '2026-04-10T08:00:00.000Z',
    updated_at: '2026-04-10T08:00:00.000Z',
    ...overrides,
  };
}

function makeTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: 't-1',
    from_wallet_id: 'w-1',
    to_wallet_id: 'w-2',
    amount: 50000,
    date: '2026-04-12',
    note: null,
    created_at: '2026-04-12T08:00:00.000Z',
    updated_at: '2026-04-12T08:00:00.000Z',
    ...overrides,
  };
}

// Pull a single data row out of a CSV string. Header is line 0, first data
// row is line 1. Returns the raw line (still quoted) so tests can assert on
// the exact escaping.
function dataLine(csv: string, index: number): string {
  const lines = csv.split('\n');
  // Trailing newline produces an empty final element; ignore it for indexing.
  return lines[1 + index];
}

describe('exportToJson', () => {
  it('produces parseable JSON with schemaVersion=1 and all six table keys', () => {
    const snapshot = makeSnapshot();
    const json = exportToJson(snapshot);
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.exportedAt).toBe('2026-05-01T08:00:00.000Z');
    expect(parsed.wallet).toEqual([]);
    expect(parsed.bill).toEqual([]);
    expect(parsed.category).toEqual([]);
    expect(parsed.bill_payment).toEqual([]);
    expect(parsed.expense).toEqual([]);
    expect(parsed.transfer).toEqual([]);
  });

  it('includes archived rows in the table arrays', () => {
    const snapshot = makeSnapshot({
      wallet: [
        makeWallet({ id: 'w-active', archived: false }),
        makeWallet({ id: 'w-archived', archived: true }),
      ],
    });
    const parsed = JSON.parse(exportToJson(snapshot));
    expect(parsed.wallet).toHaveLength(2);
    const ids: string[] = parsed.wallet.map((w: Wallet) => w.id);
    expect(ids).toContain('w-archived');
  });

  it('preserves integer centavos as numbers (not strings)', () => {
    const snapshot = makeSnapshot({
      bill_payment: [makeBillPayment({ amount: 159900 })],
    });
    const parsed = JSON.parse(exportToJson(snapshot));
    expect(parsed.bill_payment[0].amount).toBe(159900);
    expect(typeof parsed.bill_payment[0].amount).toBe('number');
  });
});

describe('exportToCsv', () => {
  it('returns six entries, one per table, in schema declaration order', () => {
    const csvs = exportToCsv(makeSnapshot());
    expect(csvs.size).toBe(6);
    expect(Array.from(csvs.keys())).toEqual([
      'wallet',
      'bill',
      'category',
      'bill_payment',
      'expense',
      'transfer',
    ]);
  });

  it('emits stable header rows that match db/schema.ts column order', () => {
    const csvs = exportToCsv(makeSnapshot());
    expect(csvs.get('wallet')!.split('\n')[0]).toBe(
      [
        '"id"',
        '"name"',
        '"color"',
        '"icon"',
        '"type"',
        '"show_balance"',
        '"opening_balance"',
        '"archived"',
        '"created_at"',
        '"updated_at"',
      ].join(','),
    );
    expect(csvs.get('bill_payment')!.split('\n')[0]).toBe(
      [
        '"id"',
        '"bill_id"',
        '"wallet_id"',
        '"amount"',
        '"paid_date"',
        '"period"',
        '"note"',
        '"created_at"',
        '"updated_at"',
      ].join(','),
    );
  });

  it('escapes a field containing a comma by quoting (RFC 4180)', () => {
    const csvs = exportToCsv(
      makeSnapshot({
        expense: [
          makeExpense({ description: 'Lunch, snacks, drinks' }),
        ],
      }),
    );
    const line = dataLine(csvs.get('expense')!, 0);
    // The quoted form must contain the literal commas inside a single quoted
    // field, so we expect the field as a whole substring.
    expect(line).toContain('"Lunch, snacks, drinks"');
  });

  it('escapes a field containing double quotes by doubling them', () => {
    const csvs = exportToCsv(
      makeSnapshot({
        expense: [makeExpense({ description: 'She said "hi"' })],
      }),
    );
    const line = dataLine(csvs.get('expense')!, 0);
    expect(line).toContain('"She said ""hi"""');
  });

  it('keeps a field containing a newline intact via quoting', () => {
    const csvs = exportToCsv(
      makeSnapshot({
        expense: [makeExpense({ description: 'line1\nline2', note: 'a\nb' })],
      }),
    );
    const csv = csvs.get('expense')!;
    // Header + 1 data row = 2 logical rows. Because the data row contains a
    // newline INSIDE a quoted field, splitting on '\n' yields more pieces
    // than logical rows — that's expected and is exactly what RFC 4180
    // readers handle. The test asserts the bytes are preserved.
    expect(csv).toContain('"line1\nline2"');
    expect(csv).toContain('"a\nb"');
  });

  it('serializes booleans as "true" / "false"', () => {
    const csvs = exportToCsv(
      makeSnapshot({
        wallet: [
          makeWallet({ id: 'w-on', show_balance: true, archived: false }),
          makeWallet({ id: 'w-off', show_balance: false, archived: true }),
        ],
      }),
    );
    const line0 = dataLine(csvs.get('wallet')!, 0);
    const line1 = dataLine(csvs.get('wallet')!, 1);
    // show_balance column is index 5; archived is index 7.
    expect(line0.split(',')[5]).toBe('"true"');
    expect(line0.split(',')[7]).toBe('"false"');
    expect(line1.split(',')[5]).toBe('"false"');
    expect(line1.split(',')[7]).toBe('"true"');
  });

  it('serializes nullable fields as empty string', () => {
    const csvs = exportToCsv(
      makeSnapshot({
        wallet: [makeWallet({ icon: null, opening_balance: null })],
        expense: [makeExpense({ amount: null, note: null })],
      }),
    );
    const walletLine = dataLine(csvs.get('wallet')!, 0);
    // icon is column 3, opening_balance is column 6 — both should be `""`.
    const wcells = walletLine.split(',');
    expect(wcells[3]).toBe('""');
    expect(wcells[6]).toBe('""');

    const expenseLine = dataLine(csvs.get('expense')!, 0);
    const ecells = expenseLine.split(',');
    // amount is column 2, note is column 6.
    expect(ecells[2]).toBe('""');
    expect(ecells[6]).toBe('""');
  });

  it('serializes integer centavos as the integer (no division by 100)', () => {
    const csvs = exportToCsv(
      makeSnapshot({
        bill_payment: [makeBillPayment({ amount: 159900 })],
        expense: [makeExpense({ amount: 15000 })],
        transfer: [makeTransfer({ amount: 50000 })],
      }),
    );
    expect(dataLine(csvs.get('bill_payment')!, 0)).toContain('"159900"');
    expect(dataLine(csvs.get('expense')!, 0)).toContain('"15000"');
    expect(dataLine(csvs.get('transfer')!, 0)).toContain('"50000"');
  });

  it('returns header-only CSV for empty tables', () => {
    const csvs = exportToCsv(makeSnapshot());
    for (const [, csv] of csvs) {
      const lines = csv.split('\n').filter((l) => l.length > 0);
      // Exactly one non-empty line: the header.
      expect(lines).toHaveLength(1);
      expect(lines[0].startsWith('"id"')).toBe(true);
    }
  });

  it('round-trips an archived bill through the bill CSV', () => {
    const csvs = exportToCsv(
      makeSnapshot({
        bill: [
          makeBill({ id: 'b-archived', name: 'Old gym', archived: true }),
        ],
        category: [makeCategory({ archived: true })],
      }),
    );
    const billLine = dataLine(csvs.get('bill')!, 0);
    expect(billLine).toContain('"b-archived"');
    expect(billLine).toContain('"Old gym"');
    // archived column is the 12th index (0-based 11).
    expect(billLine.split(',')[11]).toBe('"true"');

    const catLine = dataLine(csvs.get('category')!, 0);
    expect(catLine.split(',')[3]).toBe('"true"');
  });
});

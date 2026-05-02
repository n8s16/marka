// Export helpers for Marka's "save my data to a file" flow.
//
// PRD §"Behavior decisions" — Backups: manual export from Settings produces a
// JSON file (full fidelity) or per-table CSVs (for spreadsheets). Both export
// options include archived records, so the caller is expected to fetch every
// table with `includeArchived: true`.
//
// Pure functions only. No DB calls, no file system, no React. The caller
// passes in an `ExportSnapshot` containing already-fetched rows; this module
// turns that snapshot into either a single JSON string or a Map of CSV
// strings keyed by table name. The Settings-export screen handles the
// FileSystem / Sharing side-effects.
//
// Currency stays as integer centavos in BOTH formats. Don't divide by 100.
// The CSV is meant for downstream import; users opening it in Sheets can
// divide by 100 themselves. Integer centavos is the clearest contract.
//
// CSV encoding follows RFC 4180:
//   - Every field is wrapped in double quotes.
//   - Internal double quotes are escaped by doubling them.
//   - Commas and newlines inside fields are safe because of the quoting.
//   - Booleans serialize as "true" / "false".
//   - Nulls serialize as empty strings (i.e. just `""`).
//   - Dates and timestamps are ISO strings (already stored that way per
//     DATA_MODEL.md), so they pass through as-is.
//
// Object keys in the JSON snapshot match the table names in db/schema.ts so
// the data round-trips cleanly if a CSV/JSON import ever lands (deferred for
// v1 per PRD §"What's deliberately not in v1").

import type { Wallet } from '@/db/queries/wallets';
import type { Bill } from '@/db/queries/bills';
import type { Category } from '@/db/queries/categories';
import type { BillPayment } from '@/db/queries/bill-payments';
import type { Expense } from '@/db/queries/expenses';
import type { Transfer } from '@/db/queries/transfers';

export interface ExportSnapshot {
  /** ISO timestamp captured by the caller at the moment of export. */
  exportedAt: string;
  /**
   * Schema version of this export. Bumped if/when the exported shape
   * changes incompatibly so a future import path can branch on it.
   */
  schemaVersion: 1;
  wallet: Wallet[];
  bill: Bill[];
  category: Category[];
  bill_payment: BillPayment[];
  expense: Expense[];
  transfer: Transfer[];
}

// Header order is fixed per table — kept stable so anyone diffing two
// exports sees clean line-level diffs instead of column reorderings, and so
// the CSV is predictable for spreadsheet workflows.
//
// Column lists mirror the schema in db/schema.ts. `as const` lets us type the
// row builder against the same keys.

const WALLET_COLUMNS = [
  'id',
  'name',
  'color',
  'icon',
  'type',
  'show_balance',
  'opening_balance',
  'archived',
  'created_at',
  'updated_at',
] as const;

const BILL_COLUMNS = [
  'id',
  'name',
  'expected_amount',
  'frequency',
  'interval_months',
  'due_day',
  'start_period',
  'default_wallet_id',
  'reminder_offset_days',
  'reminder_time',
  'auto_forecast',
  'archived',
  'created_at',
  'updated_at',
] as const;

const CATEGORY_COLUMNS = [
  'id',
  'name',
  'icon',
  'archived',
  'sort_order',
  'created_at',
  'updated_at',
] as const;

const BILL_PAYMENT_COLUMNS = [
  'id',
  'bill_id',
  'wallet_id',
  'amount',
  'paid_date',
  'period',
  'note',
  'created_at',
  'updated_at',
] as const;

const EXPENSE_COLUMNS = [
  'id',
  'description',
  'amount',
  'category_id',
  'wallet_id',
  'date',
  'note',
  'created_at',
  'updated_at',
] as const;

const TRANSFER_COLUMNS = [
  'id',
  'from_wallet_id',
  'to_wallet_id',
  'amount',
  'date',
  'note',
  'created_at',
  'updated_at',
] as const;

/**
 * Full-fidelity JSON export. Pretty-printed (2-space indent) so the file is
 * legible to a human opening it in a text editor — the file isn't large
 * enough at our scale for compactness to matter.
 *
 * Caller responsibility: pass `includeArchived: true` when fetching the
 * three reference tables (wallet, bill, category) so archived rows are
 * included per the PRD. Event tables have no archived flag.
 */
export function exportToJson(snapshot: ExportSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

/**
 * Per-table CSV export. Returns a Map keyed by table name with one CSV
 * string per table. Each CSV has a header row of column names matching
 * db/schema.ts, followed by one row per record. Empty tables produce a
 * header-only CSV (a single line with the column names) — never an empty
 * string, so downstream import tooling can read the schema regardless of
 * data presence.
 *
 * Map key insertion order is the same order the tables are declared in
 * db/schema.ts: wallet, bill, category, bill_payment, expense, transfer.
 * Callers iterating with `for...of` will see that order.
 */
export function exportToCsv(snapshot: ExportSnapshot): Map<string, string> {
  const out = new Map<string, string>();
  out.set('wallet', buildCsv(WALLET_COLUMNS, snapshot.wallet));
  out.set('bill', buildCsv(BILL_COLUMNS, snapshot.bill));
  out.set('category', buildCsv(CATEGORY_COLUMNS, snapshot.category));
  out.set('bill_payment', buildCsv(BILL_PAYMENT_COLUMNS, snapshot.bill_payment));
  out.set('expense', buildCsv(EXPENSE_COLUMNS, snapshot.expense));
  out.set('transfer', buildCsv(TRANSFER_COLUMNS, snapshot.transfer));
  return out;
}

// ─── Internals ──────────────────────────────────────────────────────────────

function buildCsv<T extends Record<string, unknown>>(
  columns: ReadonlyArray<keyof T & string>,
  rows: ReadonlyArray<T>,
): string {
  const lines: string[] = [];
  lines.push(columns.map(quoteField).join(','));
  for (const row of rows) {
    const cells: string[] = [];
    for (const col of columns) {
      cells.push(quoteField(serializeCell(row[col])));
    }
    lines.push(cells.join(','));
  }
  // Trailing newline so the file ends cleanly when concatenated or
  // appended-to. Spreadsheet apps tolerate either; downstream tools tend to
  // prefer the trailing newline.
  return lines.join('\n') + '\n';
}

/**
 * Convert one cell value to its CSV string form (BEFORE quoting). Booleans
 * become "true"/"false", null/undefined become the empty string, numbers
 * become their JS toString (integer centavos pass straight through), and
 * everything else becomes its String() form.
 */
function serializeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  // Defensive fallback: stringify objects/arrays. Schema doesn't currently
  // surface any non-primitive cell values, so this branch is mainly for
  // forward-compatibility if someone adds a JSON column later.
  return String(value);
}

/**
 * Wrap a string in double quotes and escape any internal double quotes by
 * doubling them, per RFC 4178 / 4180. We always quote, even for fields that
 * don't strictly need it — uniformity keeps the format simple to reason
 * about and immune to fields that contain commas, quotes, or newlines.
 */
function quoteField(raw: string): string {
  return `"${raw.replace(/"/g, '""')}"`;
}

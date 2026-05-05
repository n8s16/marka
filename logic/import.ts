// JSON import — parse and validate a previously-exported snapshot.
//
// Pairs with `logic/export.ts` (which produces the snapshot) and
// `db/queries/import.ts` (which writes it back to the database). This
// module owns parsing only — no DB calls, no I/O.
//
// Validation strategy: structural, not column-level. We confirm:
//   - JSON parses
//   - `schemaVersion` is `1` (the only version we know about)
//   - All six table keys exist and are arrays
// We do NOT validate row shapes column-by-column — Drizzle's schema
// enforces that on insert via SQLite. A malformed row will surface as
// a sensible insert error rather than a parse error here. The trade-off
// is fewer error messages we have to maintain, with a minor downside:
// the user sees a SQL-flavoured error instead of "wallet[3].name missing"
// for a hand-edited file. Worth it given how rarely import is used.
//
// Throws `ImportParseError` with a user-friendly message on any failure;
// the message is suitable for display in the import screen's red banner.

import type { ExportSnapshot } from './export';

export class ImportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportParseError';
  }
}

const TABLE_KEYS = [
  'wallet',
  'bill',
  'category',
  'bill_payment',
  'expense',
  'transfer',
] as const;

/**
 * Parse and validate the contents of a Marka JSON export file.
 *
 * @param rawText The full text of a `marka-export-*.json` file.
 * @throws {ImportParseError} when the JSON is malformed, the schema
 *   version is unrecognised, or any required table key is missing or
 *   not an array.
 */
export function parseExportJson(rawText: string): ExportSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new ImportParseError(
      `Not valid JSON: ${(err as Error).message}`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new ImportParseError('Top level must be an object.');
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.schemaVersion !== 1) {
    throw new ImportParseError(
      `Unsupported schemaVersion ${String(obj.schemaVersion)}. ` +
        `This build of Marka understands version 1.`,
    );
  }

  for (const key of TABLE_KEYS) {
    if (!(key in obj)) {
      throw new ImportParseError(`Missing required key: "${key}".`);
    }
    if (!Array.isArray(obj[key])) {
      throw new ImportParseError(`"${key}" must be an array.`);
    }
  }

  // exportedAt is informational only; tolerate anything string-shaped.
  if (typeof obj.exportedAt !== 'string') {
    throw new ImportParseError('"exportedAt" must be a string.');
  }

  return parsed as ExportSnapshot;
}

/**
 * Friendly count summary for the confirmation prompt.
 * `{ wallet: 4, bill: 12, ... }` → easy to display.
 */
export function summariseSnapshot(
  snapshot: ExportSnapshot,
): Record<(typeof TABLE_KEYS)[number], number> {
  return {
    wallet: snapshot.wallet.length,
    bill: snapshot.bill.length,
    category: snapshot.category.length,
    bill_payment: snapshot.bill_payment.length,
    expense: snapshot.expense.length,
    transfer: snapshot.transfer.length,
  };
}

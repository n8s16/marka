// Typed query helpers for the `bill_payment` event table.
//
// A bill_payment row is the event of marking a bill paid for a period. The
// (bill_id, period) pair is unique at the schema level — see DATA_MODEL.md
// "Period uniqueness for BillPayment". When the user attempts to record a
// second payment for the same bill+period, this layer surfaces a typed
// `BillPaymentPeriodConflictError` so the UI can show the
// overwrite-or-change-period dialog (PRD §"Behavior decisions").
//
// `paid_date` is when the user actually paid; `period` is which due-month
// the payment satisfies. They are usually but not always in the same
// month — paying May 2 for April's electricity bill is normal.
//
// Hard delete is allowed; bill_payment has no archive flag because deleting
// a payment is a "this didn't actually happen" correction, not an
// account-level decision. The calling UI should still confirm before
// invoking `hardDeleteBillPayment`.

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';

import { uuid } from '../../utils/uuid';
import { bill_payment } from '../schema';

export type BillPayment = InferSelectModel<typeof bill_payment>;
export type BillPaymentInsert = Omit<
  InferInsertModel<typeof bill_payment>,
  'id' | 'created_at' | 'updated_at'
>;
export type BillPaymentPatch = Partial<BillPaymentInsert>;

export type AnySQLiteDB = BaseSQLiteDatabase<'sync' | 'async', any, any, any>;

// Typed error for the (bill_id, period) unique constraint violation. The UI
// catches this to render the overwrite-or-pick-different-period dialog.
//
// We carry the original SQLite error in `cause` for diagnostics. The class
// name is stable; `instanceof` checks are the supported way to react to
// this error.
export class BillPaymentPeriodConflictError extends Error {
  readonly bill_id: string;
  readonly period: string;
  override readonly cause: unknown;

  constructor(bill_id: string, period: string, cause: unknown) {
    super(
      `A payment already exists for bill ${bill_id} in period ${period}.`,
    );
    this.name = 'BillPaymentPeriodConflictError';
    this.bill_id = bill_id;
    this.period = period;
    this.cause = cause;
    // Restore the prototype chain — TypeScript loses it through Error subclassing
    // when targeting older runtimes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// SQLite's authoritative wording for this kind of failure is
// `UNIQUE constraint failed: bill_payment.bill_id, bill_payment.period`.
// The same wording is produced by both expo-sqlite (the Marka runtime DB)
// and better-sqlite3 (commonly used in tests). We match defensively, lower
// case, on a substring of the message: the prefix "unique constraint failed"
// is common across builds, and the table.column tokens for OUR unique index
// are stable. If a future SQLite build phrases this differently we will
// fail loud rather than silently mis-classify.
const UNIQUE_PREFIX = 'unique constraint failed';
const UNIQUE_BILL_TOKEN = 'bill_payment.bill_id';
const UNIQUE_PERIOD_TOKEN = 'bill_payment.period';

function isBillPeriodUniqueError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const msg = String((err as { message?: unknown }).message ?? '').toLowerCase();
  return (
    msg.includes(UNIQUE_PREFIX) &&
    msg.includes(UNIQUE_BILL_TOKEN) &&
    msg.includes(UNIQUE_PERIOD_TOKEN)
  );
}

export interface ListBillPaymentsOptions {
  billId?: string;
  period?: string;
  walletId?: string;
  paidDateFrom?: string; // YYYY-MM-DD inclusive
  paidDateTo?: string; // YYYY-MM-DD inclusive
}

export async function listBillPayments(
  db: AnySQLiteDB,
  options: ListBillPaymentsOptions = {},
): Promise<BillPayment[]> {
  const filters = [
    options.billId ? eq(bill_payment.bill_id, options.billId) : undefined,
    options.period ? eq(bill_payment.period, options.period) : undefined,
    options.walletId ? eq(bill_payment.wallet_id, options.walletId) : undefined,
    options.paidDateFrom
      ? gte(bill_payment.paid_date, options.paidDateFrom)
      : undefined,
    options.paidDateTo ? lte(bill_payment.paid_date, options.paidDateTo) : undefined,
  ].filter((f): f is NonNullable<typeof f> => f !== undefined);

  return db
    .select()
    .from(bill_payment)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(bill_payment.paid_date), asc(bill_payment.created_at));
}

export async function getBillPaymentByBillAndPeriod(
  db: AnySQLiteDB,
  billId: string,
  period: string,
): Promise<BillPayment | undefined> {
  const rows = await db
    .select()
    .from(bill_payment)
    .where(and(eq(bill_payment.bill_id, billId), eq(bill_payment.period, period)))
    .limit(1);
  return rows[0];
}

export async function getBillPaymentById(
  db: AnySQLiteDB,
  id: string,
): Promise<BillPayment | undefined> {
  const rows = await db
    .select()
    .from(bill_payment)
    .where(eq(bill_payment.id, id))
    .limit(1);
  return rows[0];
}

export async function createBillPayment(
  db: AnySQLiteDB,
  input: BillPaymentInsert,
): Promise<BillPayment> {
  const id = uuid();
  try {
    const rows = await db
      .insert(bill_payment)
      .values({ ...input, id })
      .returning();
    return rows[0];
  } catch (err) {
    if (isBillPeriodUniqueError(err)) {
      throw new BillPaymentPeriodConflictError(input.bill_id, input.period, err);
    }
    throw err;
  }
}

export async function updateBillPayment(
  db: AnySQLiteDB,
  id: string,
  patch: BillPaymentPatch,
): Promise<BillPayment | undefined> {
  try {
    const rows = await db
      .update(bill_payment)
      .set(patch)
      .where(eq(bill_payment.id, id))
      .returning();
    return rows[0];
  } catch (err) {
    if (isBillPeriodUniqueError(err)) {
      // Resolve the colliding pair from the patch when possible, falling back
      // to the existing row's values for whichever side wasn't being changed.
      let bill_id = patch.bill_id;
      let period = patch.period;
      if (bill_id === undefined || period === undefined) {
        const existing = await getBillPaymentById(db, id);
        bill_id = bill_id ?? existing?.bill_id ?? '';
        period = period ?? existing?.period ?? '';
      }
      throw new BillPaymentPeriodConflictError(bill_id, period, err);
    }
    throw err;
  }
}

// Hard delete — only call after explicit user confirmation in the UI. There
// is no archive flag for bill_payment because removing a payment is a
// correction, not an account-level archival.
export async function hardDeleteBillPayment(
  db: AnySQLiteDB,
  id: string,
): Promise<void> {
  await db.delete(bill_payment).where(eq(bill_payment.id, id));
}

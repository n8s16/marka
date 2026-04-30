// Typed query helpers for the `bill` reference table.
//
// Bills are recurring obligations: utilities, internet, subscriptions, MP2,
// insurance. See docs/DATA_MODEL.md for the cadence rules around `frequency`,
// `interval_months`, `start_period`, and `due_day`. This layer ONLY persists
// values; cadence validation, due-day clamping, period derivation, and
// status calculations live in /logic and are owned by
// `business-logic-developer`.
//
// Hard delete cascades to bill_payment via ON DELETE CASCADE on the
// foreign key. The calling UI must confirm with the user before invoking
// `hardDeleteBill` since payment history disappears with the bill.

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { asc, eq } from 'drizzle-orm';

import { uuid } from '../../utils/uuid';
import { bill } from '../schema';

export type Bill = InferSelectModel<typeof bill>;
export type BillInsert = Omit<
  InferInsertModel<typeof bill>,
  'id' | 'created_at' | 'updated_at'
>;
export type BillPatch = Partial<BillInsert>;

export type AnySQLiteDB = BaseSQLiteDatabase<'sync' | 'async', any, any, any>;

export interface ListBillsOptions {
  includeArchived?: boolean;
}

export async function listBills(
  db: AnySQLiteDB,
  options: ListBillsOptions = {},
): Promise<Bill[]> {
  return db
    .select()
    .from(bill)
    .where(options.includeArchived ? undefined : eq(bill.archived, false))
    .orderBy(asc(bill.created_at));
}

export async function getBillById(
  db: AnySQLiteDB,
  id: string,
): Promise<Bill | undefined> {
  const rows = await db.select().from(bill).where(eq(bill.id, id)).limit(1);
  return rows[0];
}

export async function createBill(db: AnySQLiteDB, input: BillInsert): Promise<Bill> {
  const id = uuid();
  const rows = await db
    .insert(bill)
    .values({ ...input, id })
    .returning();
  return rows[0];
}

export async function updateBill(
  db: AnySQLiteDB,
  id: string,
  patch: BillPatch,
): Promise<Bill | undefined> {
  const rows = await db.update(bill).set(patch).where(eq(bill.id, id)).returning();
  return rows[0];
}

export async function archiveBill(
  db: AnySQLiteDB,
  id: string,
): Promise<Bill | undefined> {
  return updateBill(db, id, { archived: true });
}

export async function unarchiveBill(
  db: AnySQLiteDB,
  id: string,
): Promise<Bill | undefined> {
  return updateBill(db, id, { archived: false });
}

// Hard delete cascades to bill_payment rows. The calling UI must confirm
// with the user before invoking — payment history goes with the bill.
export async function hardDeleteBill(db: AnySQLiteDB, id: string): Promise<void> {
  await db.delete(bill).where(eq(bill.id, id));
}

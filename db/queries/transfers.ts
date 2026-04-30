// Typed query helpers for the `transfer` event table.
//
// A transfer moves money between two of the user's own wallets — Maya to
// Cash, UnionBank to GCash, etc. Transfers are NOT spending; the
// `business-logic-developer` enforces that they never appear in aggregate
// outflow totals (see DATA_MODEL.md "Transfers don't reduce net spending").
// Per-wallet outflow does include the from-side of a transfer because the
// money did leave that wallet, just not the user's pocket overall.
//
// When listing transfers for a single wallet, we return rows where the
// wallet appears on EITHER side of the transfer; that matches the
// "Movement on this wallet" affordance in the Wallets tab.
//
// Hard delete is allowed; transfer has no archive flag because deleting a
// transfer is a correction. The calling UI should still confirm.

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { and, desc, eq, gte, lte, or } from 'drizzle-orm';

import { uuid } from '../../utils/uuid';
import { transfer } from '../schema';

export type Transfer = InferSelectModel<typeof transfer>;
export type TransferInsert = Omit<
  InferInsertModel<typeof transfer>,
  'id' | 'created_at' | 'updated_at'
>;
export type TransferPatch = Partial<TransferInsert>;

export type AnySQLiteDB = BaseSQLiteDatabase<'sync' | 'async', any, any, any>;

export interface ListTransfersOptions {
  walletId?: string; // matches from_wallet_id OR to_wallet_id
  dateFrom?: string; // YYYY-MM-DD inclusive
  dateTo?: string; // YYYY-MM-DD inclusive
}

export async function listTransfers(
  db: AnySQLiteDB,
  options: ListTransfersOptions = {},
): Promise<Transfer[]> {
  const filters = [
    options.walletId
      ? or(
          eq(transfer.from_wallet_id, options.walletId),
          eq(transfer.to_wallet_id, options.walletId),
        )
      : undefined,
    options.dateFrom ? gte(transfer.date, options.dateFrom) : undefined,
    options.dateTo ? lte(transfer.date, options.dateTo) : undefined,
  ].filter((f): f is NonNullable<typeof f> => f !== undefined);

  return db
    .select()
    .from(transfer)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(transfer.date), desc(transfer.created_at));
}

export async function getTransferById(
  db: AnySQLiteDB,
  id: string,
): Promise<Transfer | undefined> {
  const rows = await db.select().from(transfer).where(eq(transfer.id, id)).limit(1);
  return rows[0];
}

export async function createTransfer(
  db: AnySQLiteDB,
  input: TransferInsert,
): Promise<Transfer> {
  const id = uuid();
  const rows = await db
    .insert(transfer)
    .values({ ...input, id })
    .returning();
  return rows[0];
}

export async function updateTransfer(
  db: AnySQLiteDB,
  id: string,
  patch: TransferPatch,
): Promise<Transfer | undefined> {
  const rows = await db
    .update(transfer)
    .set(patch)
    .where(eq(transfer.id, id))
    .returning();
  return rows[0];
}

// Hard delete — only call after explicit user confirmation in the UI.
export async function hardDeleteTransfer(db: AnySQLiteDB, id: string): Promise<void> {
  await db.delete(transfer).where(eq(transfer.id, id));
}

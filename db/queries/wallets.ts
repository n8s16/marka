// Typed query helpers for the `wallet` reference table.
//
// Wallets are source accounts (Maya, GCash, UnionBank, Cash). They live for
// the lifetime of the app and use the archive convention rather than hard
// delete by default — see docs/DATA_MODEL.md for the rules and behavioral
// notes. Hard delete is allowed via `hardDeleteWallet`, but the calling UI
// must confirm with the user first since it cascades to dependent events
// (note: foreign keys are declared with ON DELETE RESTRICT, so a wallet
// referenced by a bill, payment, expense, or transfer cannot be hard-deleted
// at all without first reassigning those rows).
//
// Every helper takes a Drizzle DB instance as its first argument so tests can
// pass a fresh in-memory database without wrestling with module-level state.

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { asc, eq } from 'drizzle-orm';

import { uuid } from '../../utils/uuid';
import { wallet } from '../schema';

export type Wallet = InferSelectModel<typeof wallet>;
export type WalletInsert = Omit<
  InferInsertModel<typeof wallet>,
  'id' | 'created_at' | 'updated_at'
>;
export type WalletPatch = Partial<WalletInsert>;

// Permissive DB type — see comment in db/seed.ts for the rationale.
export type AnySQLiteDB = BaseSQLiteDatabase<'sync' | 'async', any, any, any>;

export interface ListWalletsOptions {
  includeArchived?: boolean;
}

export async function listWallets(
  db: AnySQLiteDB,
  options: ListWalletsOptions = {},
): Promise<Wallet[]> {
  return db
    .select()
    .from(wallet)
    .where(options.includeArchived ? undefined : eq(wallet.archived, false))
    .orderBy(asc(wallet.created_at));
}

export async function getWalletById(
  db: AnySQLiteDB,
  id: string,
): Promise<Wallet | undefined> {
  const rows = await db.select().from(wallet).where(eq(wallet.id, id)).limit(1);
  return rows[0];
}

export async function createWallet(
  db: AnySQLiteDB,
  input: WalletInsert,
): Promise<Wallet> {
  const id = uuid();
  const rows = await db
    .insert(wallet)
    .values({ ...input, id })
    .returning();
  return rows[0];
}

export async function updateWallet(
  db: AnySQLiteDB,
  id: string,
  patch: WalletPatch,
): Promise<Wallet | undefined> {
  const rows = await db.update(wallet).set(patch).where(eq(wallet.id, id)).returning();
  return rows[0];
}

export async function archiveWallet(
  db: AnySQLiteDB,
  id: string,
): Promise<Wallet | undefined> {
  return updateWallet(db, id, { archived: true });
}

export async function unarchiveWallet(
  db: AnySQLiteDB,
  id: string,
): Promise<Wallet | undefined> {
  return updateWallet(db, id, { archived: false });
}

// Hard delete — only call after explicit user confirmation in the UI. The
// foreign keys on bill/bill_payment/expense/transfer use ON DELETE RESTRICT,
// so this will fail if the wallet is still referenced. The caller is
// responsible for either reassigning or deleting those references first.
export async function hardDeleteWallet(db: AnySQLiteDB, id: string): Promise<void> {
  await db.delete(wallet).where(eq(wallet.id, id));
}

// Typed query helpers for the `expense` event table.
//
// An expense is a one-off, non-bill purchase: groceries, gadgets, a meal out.
// Every expense is tagged to a wallet (where the money came from) and a
// category (what it was for). See docs/DATA_MODEL.md.
//
// `amount` is nullable: the user can log an amount-less placeholder when
// they want to remember what they bought but haven't tallied the receipt
// yet. The Spending tab handles missing amounts gracefully.
//
// Hard delete is allowed; expense has no archive flag because removing an
// expense entry is a correction, not an account-level archival. The calling
// UI should still confirm before invoking `hardDeleteExpense`.

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { and, desc, eq, gte, lte } from 'drizzle-orm';

import { uuid } from '../../utils/uuid';
import { expense } from '../schema';

export type Expense = InferSelectModel<typeof expense>;
export type ExpenseInsert = Omit<
  InferInsertModel<typeof expense>,
  'id' | 'created_at' | 'updated_at'
>;
export type ExpensePatch = Partial<ExpenseInsert>;

export type AnySQLiteDB = BaseSQLiteDatabase<'sync' | 'async', any, any, any>;

export interface ListExpensesOptions {
  walletId?: string;
  categoryId?: string;
  dateFrom?: string; // YYYY-MM-DD inclusive
  dateTo?: string; // YYYY-MM-DD inclusive
}

export async function listExpenses(
  db: AnySQLiteDB,
  options: ListExpensesOptions = {},
): Promise<Expense[]> {
  const filters = [
    options.walletId ? eq(expense.wallet_id, options.walletId) : undefined,
    options.categoryId ? eq(expense.category_id, options.categoryId) : undefined,
    options.dateFrom ? gte(expense.date, options.dateFrom) : undefined,
    options.dateTo ? lte(expense.date, options.dateTo) : undefined,
  ].filter((f): f is NonNullable<typeof f> => f !== undefined);

  return db
    .select()
    .from(expense)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(expense.date), desc(expense.created_at));
}

export async function getExpenseById(
  db: AnySQLiteDB,
  id: string,
): Promise<Expense | undefined> {
  const rows = await db.select().from(expense).where(eq(expense.id, id)).limit(1);
  return rows[0];
}

export async function createExpense(
  db: AnySQLiteDB,
  input: ExpenseInsert,
): Promise<Expense> {
  const id = uuid();
  const rows = await db
    .insert(expense)
    .values({ ...input, id })
    .returning();
  return rows[0];
}

export async function updateExpense(
  db: AnySQLiteDB,
  id: string,
  patch: ExpensePatch,
): Promise<Expense | undefined> {
  const rows = await db
    .update(expense)
    .set(patch)
    .where(eq(expense.id, id))
    .returning();
  return rows[0];
}

// Hard delete — only call after explicit user confirmation in the UI.
export async function hardDeleteExpense(db: AnySQLiteDB, id: string): Promise<void> {
  await db.delete(expense).where(eq(expense.id, id));
}

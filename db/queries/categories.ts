// Typed query helpers for the `category` reference table.
//
// Categories classify one-off expenses. The starter eight (Food, Transport,
// Shopping, Tech, Health, Entertainment, Personal, Misc) seed in via
// db/seed.ts on first run. Users can edit and archive; we never silently
// hard-delete. See docs/DATA_MODEL.md for the rules.
//
// Listings sort by sort_order ascending so the UI can render them in the
// user's preferred order; created_at is the secondary sort to make the
// ordering deterministic when sort_order ties (e.g. two newly added
// categories with the same default sort value).

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { asc, eq } from 'drizzle-orm';

import { uuid } from '../../utils/uuid';
import { category } from '../schema';

export type Category = InferSelectModel<typeof category>;
export type CategoryInsert = Omit<
  InferInsertModel<typeof category>,
  'id' | 'created_at' | 'updated_at'
>;
export type CategoryPatch = Partial<CategoryInsert>;

export type AnySQLiteDB = BaseSQLiteDatabase<'sync' | 'async', any, any, any>;

export interface ListCategoriesOptions {
  includeArchived?: boolean;
}

export async function listCategories(
  db: AnySQLiteDB,
  options: ListCategoriesOptions = {},
): Promise<Category[]> {
  return db
    .select()
    .from(category)
    .where(options.includeArchived ? undefined : eq(category.archived, false))
    .orderBy(asc(category.sort_order), asc(category.created_at));
}

export async function getCategoryById(
  db: AnySQLiteDB,
  id: string,
): Promise<Category | undefined> {
  const rows = await db.select().from(category).where(eq(category.id, id)).limit(1);
  return rows[0];
}

export async function createCategory(
  db: AnySQLiteDB,
  input: CategoryInsert,
): Promise<Category> {
  const id = uuid();
  const rows = await db
    .insert(category)
    .values({ ...input, id })
    .returning();
  return rows[0];
}

export async function updateCategory(
  db: AnySQLiteDB,
  id: string,
  patch: CategoryPatch,
): Promise<Category | undefined> {
  const rows = await db
    .update(category)
    .set(patch)
    .where(eq(category.id, id))
    .returning();
  return rows[0];
}

export async function archiveCategory(
  db: AnySQLiteDB,
  id: string,
): Promise<Category | undefined> {
  return updateCategory(db, id, { archived: true });
}

export async function unarchiveCategory(
  db: AnySQLiteDB,
  id: string,
): Promise<Category | undefined> {
  return updateCategory(db, id, { archived: false });
}

// Hard delete — only call after explicit user confirmation in the UI. The
// expense.category_id foreign key uses ON DELETE RESTRICT, so this will
// fail if any expense still references the category. The caller must
// reassign those expenses first.
export async function hardDeleteCategory(db: AnySQLiteDB, id: string): Promise<void> {
  await db.delete(category).where(eq(category.id, id));
}

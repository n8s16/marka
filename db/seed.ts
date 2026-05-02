// Starter seed data for Marka.
//
// Per docs/PRD.md and docs/DATA_MODEL.md, the app ships:
//
//   - Eight starter categories on first run: Food, Transport, Shopping, Tech,
//     Health, Entertainment, Personal, Misc. Auto-seeded at boot — the user
//     never picks categories during onboarding.
//   - Four canonical PH wallets offered in onboarding: Maya, GCash,
//     UnionBank, Cash. The user picks which ones to keep on the first
//     onboarding step (`/onboarding/pick-wallets`) and we insert the chosen
//     subset there. We do NOT auto-seed wallets at boot — see DB provider.
//
// Users can edit and archive both; we never hard-delete on their behalf.
//
// `seedStarterCategories` is idempotent — if any rows already exist, it
// returns without inserting. The caller (DB provider) runs it once after
// migrations.

import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

import { uuid } from '../utils/uuid';
import { category } from './schema';

// Canonical starter category list. Exported so tests, the UI's "restore
// defaults" affordance, and onboarding screens can reference the same source
// of truth. Order matters: it becomes `sort_order` 0..7.
export const STARTER_CATEGORIES = [
  'Food',
  'Transport',
  'Shopping',
  'Tech',
  'Health',
  'Entertainment',
  'Personal',
  'Misc',
] as const;

export type StarterCategoryName = (typeof STARTER_CATEGORIES)[number];

// Permissive DB type so this works for both sync (`drizzle/expo`) and async
// (`drizzle/better-sqlite3` in tests) databases without forcing the caller to
// thread schema generics. Acceptable here because the helper only uses the
// schema's `category` table; it does not depend on the broader schema shape.
export type AnySQLiteDB = BaseSQLiteDatabase<'sync' | 'async', any, any, any>;

export async function seedStarterCategories(db: AnySQLiteDB): Promise<void> {
  // Use raw count() so we don't depend on whether the connected DB is sync or
  // async at the type level — both shapes resolve through `await`.
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(category);

  const existing = result[0]?.count ?? 0;
  if (existing > 0) return;

  const rows = STARTER_CATEGORIES.map((name, sort_order) => ({
    id: uuid(),
    name,
    sort_order,
  }));

  await db.insert(category).values(rows);
}

// Canonical starter wallet list — the four PH defaults pre-checked during
// onboarding (PRD §"Onboarding"). Brand colors mirror tokens.walletBrand and
// docs/PRD.md §"Wallet brand colors". The pick-wallets onboarding screen
// reads this directly to render its checkbox list.
export const STARTER_WALLETS = [
  { name: 'Maya', color: '#00B14F', type: 'e_wallet' },
  { name: 'GCash', color: '#007DFE', type: 'e_wallet' },
  { name: 'UnionBank', color: '#FF8000', type: 'bank' },
  { name: 'Cash', color: '#888780', type: 'cash' },
] as const satisfies ReadonlyArray<{
  name: string;
  color: string;
  type: 'e_wallet' | 'bank' | 'cash';
}>;

export type StarterWalletName = (typeof STARTER_WALLETS)[number]['name'];

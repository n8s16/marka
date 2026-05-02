// Database reset — deletes all user data.
//
// Used by Settings → Reset. Deletes every row from every table in
// foreign-key-safe order (deepest dependents first), then re-seeds the
// starter categories so the app remains operational after the wipe.
//
// We do NOT re-seed wallets here — that's the onboarding flow's job. After
// a reset the app boots back into onboarding (the persisted
// `hasCompletedOnboarding` flag is cleared in the screen-side handler).
//
// Schema FK shape (from db/schema.ts):
//   bill_payment → bill, wallet
//   expense      → category, wallet
//   transfer     → wallet (×2)
//   bill         → wallet
//   category, wallet — leaves
//
// FK declarations use ON DELETE RESTRICT, so we must delete dependents
// before parents. The order below is the only safe order.

import { bill, bill_payment, category, expense, transfer, wallet } from '../schema';
import { type AnySQLiteDB, seedStarterCategories } from '../seed';

export async function clearAllData(db: AnySQLiteDB): Promise<void> {
  // Order is FK-driven; do not reorder casually.
  await db.delete(bill_payment);
  await db.delete(expense);
  await db.delete(transfer);
  await db.delete(bill);
  await db.delete(category);
  await db.delete(wallet);

  // Re-seed categories. The boot-time seed runs once per app session and
  // is guarded by a ref, so it won't re-fire on its own after this wipe.
  // The seed helper is idempotent — it only inserts when the table is empty.
  await seedStarterCategories(db);
}

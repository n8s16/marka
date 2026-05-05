// Apply a parsed export snapshot to the database.
//
// Pairs with `logic/import.ts` (which parses the JSON) and reuses
// `db/queries/reset.ts`'s `clearAllData` to wipe before insert.
//
// Order matters: clear in dependency-tail order, then re-seed
// categories from `seedStarterCategories` (clearAllData does this
// already), then INSERT in dependency-head order so foreign keys
// resolve. Same FK shape as the reset module:
//   bill_payment → bill, wallet
//   expense      → category, wallet
//   transfer     → wallet (×2)
//   bill         → wallet
//   category, wallet — leaves
//
// Replace-all semantics for v1. Merge-mode could come later if the
// product wants it; for now this is the simpler, clearer mental model
// (mirrors Reset, which the user is already familiar with).

import type { ExportSnapshot } from '@/logic/export';
import { bill, bill_payment, category, expense, transfer, wallet } from '../schema';
import { type AnySQLiteDB } from '../seed';
import { clearAllData } from './reset';

export async function applyImport(
  db: AnySQLiteDB,
  snapshot: ExportSnapshot,
): Promise<void> {
  // 1. Wipe everything (and re-seed starter categories).
  await clearAllData(db);

  // 2. Wipe the auto-seeded categories so the imported set is the
  //    only one present. clearAllData re-seeds starter categories so
  //    the app stays operational mid-flight, but for an import we
  //    want the snapshot's categories to be authoritative.
  if (snapshot.category.length > 0) {
    await db.delete(category);
  }

  // 3. Insert in FK-safe order: leaves first.
  if (snapshot.wallet.length > 0) {
    await db.insert(wallet).values(snapshot.wallet);
  }
  if (snapshot.category.length > 0) {
    await db.insert(category).values(snapshot.category);
  }

  // 4. Then dependents.
  if (snapshot.bill.length > 0) {
    await db.insert(bill).values(snapshot.bill);
  }
  if (snapshot.bill_payment.length > 0) {
    await db.insert(bill_payment).values(snapshot.bill_payment);
  }
  if (snapshot.expense.length > 0) {
    await db.insert(expense).values(snapshot.expense);
  }
  if (snapshot.transfer.length > 0) {
    await db.insert(transfer).values(snapshot.transfer);
  }
}

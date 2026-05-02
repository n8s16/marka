// Per-wallet balance computation.
//
// Source of truth: docs/DATA_MODEL.md §"Wallet balance" and §"Wallet" (the
// `opening_balance` rationale). Balance is derived from the one intentional
// state field (`opening_balance`) plus all recorded events:
//
//   balance = opening_balance
//           + sum(Transfer.amount where to_wallet_id = X)
//           - sum(Transfer.amount where from_wallet_id = X)
//           - sum(BillPayment.amount where wallet_id = X)
//           - sum(Expense.amount where wallet_id = X)
//
// When the user enables `show_balance` for a wallet for the first time, the
// app asks for their current balance and BACK-CALCULATES `opening_balance`
// (the inverse of the formula above):
//
//   opening_balance = current_balance + outflows - inflows
//
// Per DATA_MODEL.md §"Wallet balance":
//   "When show_balance is false, balance is null/undefined and the UI hides
//    the field entirely."
//
// `expense.amount` is nullable per the schema; null contributes 0.
//
// Pure functions only. No DB calls, no I/O. The caller passes in ALL recorded
// events for the wallet (no time-window filter); balance is total-time, not
// month-windowed. Each function defensively filters by wallet id rather than
// trusting the caller to pre-filter.

import type { InferSelectModel } from 'drizzle-orm';
import { bill_payment, expense, transfer, wallet } from '@/db/schema';

export type Wallet = InferSelectModel<typeof wallet>;
export type BillPayment = InferSelectModel<typeof bill_payment>;
export type Expense = InferSelectModel<typeof expense>;
export type Transfer = InferSelectModel<typeof transfer>;

/**
 * Compute the current balance of a wallet from `opening_balance` plus all
 * recorded events. Returns `null` when `show_balance` is false (the UI hides
 * the field entirely in that case) or when `opening_balance` is null.
 *
 * Inflows  (positive contributions): Transfer.amount where to_wallet_id = wallet.id
 * Outflows (negative contributions): BillPayment.amount where wallet_id = wallet.id
 *                                    Expense.amount     where wallet_id = wallet.id
 *                                    Transfer.amount    where from_wallet_id = wallet.id
 *
 * `expense.amount === null` contributes 0 (per DATA_MODEL.md §Expense).
 * The caller passes ALL events for this wallet; balance is "current as of
 * all-time," not "current as of this month."
 */
export function getWalletBalance(
  wallet: Pick<Wallet, 'id' | 'show_balance' | 'opening_balance'>,
  payments: BillPayment[],
  expenses: Expense[],
  transfers: Transfer[],
): number | null {
  // Per DATA_MODEL.md §"Wallet balance": null is the "hide" signal for the UI.
  if (!wallet.show_balance) return null;
  if (wallet.opening_balance === null || wallet.opening_balance === undefined) {
    return null;
  }

  let balance = wallet.opening_balance;

  for (const p of payments) {
    if (p.wallet_id !== wallet.id) continue;
    balance -= p.amount;
  }

  for (const e of expenses) {
    if (e.wallet_id !== wallet.id) continue;
    if (e.amount === null) continue; // amount-less placeholder, contributes 0
    balance -= e.amount;
  }

  for (const t of transfers) {
    if (t.to_wallet_id === wallet.id) {
      balance += t.amount;
    }
    if (t.from_wallet_id === wallet.id) {
      balance -= t.amount;
    }
    // A self-transfer (from === to) nets to zero, which the two independent
    // checks above already produce. Self-transfers should never exist in the
    // app, but the math stays correct if one slips through.
  }

  return balance;
}

/**
 * Compute `opening_balance` by working backward from a user-reported current
 * balance. Used when the user flips `show_balance` ON and tells the app
 * "this wallet currently holds X." Mathematical inverse of getWalletBalance:
 *
 *   opening_balance = current_balance + outflows - inflows
 *
 * The caller passes ALL recorded events for the wallet (total-time, not
 * month-windowed). Returns an integer centavo value the caller persists on
 * the wallet row alongside `show_balance: true`.
 */
export function computeOpeningBalance(
  walletId: string,
  currentBalance: number,
  payments: BillPayment[],
  expenses: Expense[],
  transfers: Transfer[],
): number {
  let outflows = 0;
  let inflows = 0;

  for (const p of payments) {
    if (p.wallet_id !== walletId) continue;
    outflows += p.amount;
  }

  for (const e of expenses) {
    if (e.wallet_id !== walletId) continue;
    if (e.amount === null) continue;
    outflows += e.amount;
  }

  for (const t of transfers) {
    if (t.from_wallet_id === walletId) {
      outflows += t.amount;
    }
    if (t.to_wallet_id === walletId) {
      inflows += t.amount;
    }
  }

  return currentBalance + outflows - inflows;
}

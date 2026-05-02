// Hook: derive the current-month outflow per wallet for the Wallets tab,
// plus per-wallet running balance for wallets that have `show_balance`
// enabled.
//
// The Wallets tab is "outflow-primary" per docs/PRD.md §"Core design
// principles": it answers "what went out this calendar month, per wallet?"
// Transfers are intentionally excluded from outflow at the aggregate level
// per docs/DATA_MODEL.md §"Critical rule" — they don't reduce net spending.
//
// Filter semantics (per logic/aggregations.ts):
//   - BillPayments are filtered by `paid_date` (NOT `period`). The Wallets
//     tab is "what went out this month," not "obligations covering this
//     period."
//   - Expenses are filtered by `date`.
//
// Balance contract (per logic/wallet-balance.ts and DATA_MODEL.md §"Wallet
// balance"): `getWalletBalance` is total-time, NOT month-windowed. It
// requires ALL recorded events for the wallet (and `opening_balance` set on
// the wallet row). Mixing a month-window into the balance computation would
// silently produce wrong numbers and corrupt the round-trip with
// `computeOpeningBalance`. To honour that, this hook fetches event tables
// WITHOUT a date filter — total-time — and then derives the month-windowed
// outflow numbers in-memory via getMonthlyOutflow*. Aggregation helpers
// already filter by period prefix on date strings, so passing total-time
// rows is correct. At v1's data scale (hundreds of rows) this is cheap and
// keeps the hook straightforward — one query per table instead of two.
//
// Returned shape:
//   - walletsWithOutflow: every active wallet, sorted by total outflow desc
//     (ties broken by name asc). Wallets with zero outflow appear at the
//     bottom — the UI greys them out per the Wallets-tab brief. Each entry
//     also carries a `balance: number | null` field — null when the wallet
//     has `show_balance` off (or no recorded opening balance), otherwise a
//     centavo total per `getWalletBalance`.
//   - totalBreakdown: combined bills/spending/total across all wallets.
//   - loading / error / reload: standard async-state plumbing.
//
// Re-fetches on mount and on screen focus via useFocusEffect, mirroring
// `state/bills-current-month.ts`.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { format as formatDate } from 'date-fns';

import {
  listBillPayments,
  type BillPayment,
} from '@/db/queries/bill-payments';
import { listExpenses, type Expense } from '@/db/queries/expenses';
import { listTransfers, type Transfer } from '@/db/queries/transfers';
import { listWallets, type Wallet } from '@/db/queries/wallets';
import {
  getMonthlyOutflowByWallet,
  getMonthlyOutflowTotal,
  type OutflowBreakdown,
} from '@/logic/aggregations';
import { getWalletBalance } from '@/logic/wallet-balance';

export interface WalletOutflowEntry {
  wallet: Wallet;
  outflow: OutflowBreakdown;
  /**
   * Per-wallet running balance in centavos. `null` when the wallet has
   * `show_balance: false` or no `opening_balance` recorded — the UI hides
   * the line entirely in that case.
   */
  balance: number | null;
}

export interface WalletsCurrentMonthState {
  loading: boolean;
  error: Error | null;
  walletsWithOutflow: WalletOutflowEntry[];
  totalBreakdown: OutflowBreakdown;
  reload: () => Promise<void>;
}

const ZERO: OutflowBreakdown = { bills: 0, spending: 0, total: 0 };

export function useWalletsCurrentMonth(
  db: ExpoSQLiteDatabase,
  today: Date,
): WalletsCurrentMonthState {
  const [wallets, setWallets] = useState<Wallet[] | null>(null);
  // Total-time event lists. The aggregation helpers filter by period prefix
  // on the date strings, so we can keep all rows here without windowing.
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Period (`YYYY-MM`) derived from `today`. Memoize so the reload callback's
  // identity only changes when `today` changes.
  const period = useMemo(() => formatDate(today, 'yyyy-MM'), [today]);

  const reload = useCallback(async () => {
    try {
      const [walletsRes, paymentsRes, expensesRes, transfersRes] =
        await Promise.all([
          // Active wallets only — archived wallets don't appear on the Wallets
          // tab. Historical references on payments/expenses still resolve via
          // the per-wallet outflow map (which is keyed by wallet_id).
          listWallets(db, { includeArchived: false }),
          // Total-time fetch — required for the balance computation.
          listBillPayments(db),
          listExpenses(db),
          listTransfers(db),
        ]);

      setWallets(walletsRes);
      setPayments(paymentsRes);
      setExpenses(expensesRes);
      setTransfers(transfersRes);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const totalBreakdown = useMemo<OutflowBreakdown>(() => {
    return getMonthlyOutflowTotal(payments, expenses, period);
  }, [payments, expenses, period]);

  const walletsWithOutflow = useMemo<WalletOutflowEntry[]>(() => {
    if (!wallets) return [];

    // The by-wallet map is sparse — wallets with zero outflow are not keyed.
    // Iterate the full wallet list and fall back to ZERO for missing entries
    // so wallets without activity still appear (greyed-out in the UI).
    const map = getMonthlyOutflowByWallet(payments, expenses, period);
    const entries = wallets.map<WalletOutflowEntry>((w) => ({
      wallet: w,
      outflow: map.get(w.id) ?? ZERO,
      // getWalletBalance returns null when show_balance is off or
      // opening_balance is null — exactly the "hide the line" signal.
      balance: getWalletBalance(w, payments, expenses, transfers),
    }));

    // Sort by outflow.total desc, ties broken by name asc. This bubbles the
    // most-active wallets to the top and pushes zero-outflow wallets to the
    // bottom in alphabetical order.
    entries.sort((a, b) => {
      if (b.outflow.total !== a.outflow.total) {
        return b.outflow.total - a.outflow.total;
      }
      return a.wallet.name.localeCompare(b.wallet.name);
    });

    return entries;
  }, [wallets, payments, expenses, transfers, period]);

  return {
    loading,
    error,
    walletsWithOutflow,
    totalBreakdown,
    reload,
  };
}

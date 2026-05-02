// Hook: derive Insights-tab data for the current month plus a 6-month trend.
//
// Per docs/PRD.md §"Main tabs" — Insights:
//   "total spent · bills/spending split · by-wallet breakdown · anomaly
//    callouts ('Tech spending unusual this month') · 6-month trend chart."
//
// What this hook computes:
//   - Headline total / bills / spending for the current calendar month.
//   - Per-wallet outflow for the current month, returned as a full active-
//     wallet list ordered by total desc, ties broken by name asc; zero rows
//     bubble to the bottom (same convention as `state/wallets-current-month.ts`).
//   - Per-category spending for the current month, returned as a full active-
//     category list ordered by spending desc, ties broken by sort_order asc;
//     zero rows bubble to the bottom in sort_order order.
//   - 6-month trend (oldest → newest, exactly six points). Drives the chart.
//   - Category anomalies (lookback 3 months, threshold 1.5x). Sorted by ratio
//     desc by `getCategoryAnomalies`. Empty array when nothing's unusual.
//
// Filter semantics mirror `logic/aggregations.ts`:
//   - BillPayments are filtered by `paid_date` (NOT `period`). Insights answers
//     "what went out this month," not "obligations covering this period."
//   - Expenses are filtered by `date`. `expense.amount === null` contributes 0.
//   - Transfers are intentionally excluded everywhere — DATA_MODEL.md
//     §"Critical rule": transfers do not reduce net spending.
//
// Data fetching: one round trip pulls payments and expenses across the full
// 6-month window (current month + 5 prior). The aggregation functions handle
// in-memory period filtering — at the data volumes Marka deals in (hundreds
// to low-thousands of rows over years), 6 months of data is trivial.
//
// Re-fetches happen on mount and on screen focus via `useFocusEffect`,
// matching the other current-month hooks.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import {
  endOfMonth,
  format as formatDate,
  startOfMonth,
  subMonths,
} from 'date-fns';

import {
  listBillPayments,
  type BillPayment,
} from '@/db/queries/bill-payments';
import { listCategories, type Category } from '@/db/queries/categories';
import { listExpenses, type Expense } from '@/db/queries/expenses';
import { listWallets, type Wallet } from '@/db/queries/wallets';
import {
  getCategoryAnomalies,
  getMonthlyOutflowByCategory,
  getMonthlyOutflowByWallet,
  getMonthlyOutflowTotal,
  getMultiMonthOutflowByWallet,
  getMultiMonthOutflowTrend,
  type CategoryAnomaly,
  type MonthlyOutflowPoint,
  type OutflowBreakdown,
  type PeriodWalletOutflow,
} from '@/logic/aggregations';

export interface InsightsWalletRow {
  wallet: Wallet;
  breakdown: OutflowBreakdown;
}

export interface InsightsCategoryRow {
  category: Category;
  /** Centavos spent in the current month. */
  spending: number;
}

export interface InsightsCurrentMonthState {
  loading: boolean;
  error: Error | null;

  // Headline numbers (centavos).
  total: number;
  bills: number;
  spending: number;

  /** Active wallets, ordered by current-month outflow desc; zero rows last (alpha). */
  walletsByOutflow: InsightsWalletRow[];

  /** Active categories, ordered by current-month spending desc; zero rows last (sort_order). */
  categoriesByOutflow: InsightsCategoryRow[];

  /** 6-month trend, oldest first. Always exactly 6 points. */
  trend: MonthlyOutflowPoint[];

  /**
   * 6-month trend split per wallet, same period order as `trend`. Drives
   * the stacked-bars rendering in the Insights chart so each bar shows
   * segments colored by wallet brand. Each entry's `byWallet` is sparse
   * (zero-outflow wallets omitted) — the chart iterates the active
   * wallet list and reads `byWallet.get(walletId) ?? 0`.
   */
  trendByWallet: PeriodWalletOutflow[];

  /** Anomalous categories (ratio desc). Empty when nothing's unusual. */
  anomalies: CategoryAnomaly[];

  reload: () => Promise<void>;
}

const ZERO: OutflowBreakdown = { bills: 0, spending: 0, total: 0 };

/** Lookback for anomaly detection. Matches the briefing. */
const ANOMALY_LOOKBACK_MONTHS = 3;
/** Trend window length. Exactly 6 months ending at the current month. */
const TREND_MONTHS = 6;

export function useInsightsCurrentMonth(
  db: ExpoSQLiteDatabase,
  today: Date,
): InsightsCurrentMonthState {
  const [wallets, setWallets] = useState<Wallet[] | null>(null);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Memoize date strings so the reload callback's identity only changes when
  // the calendar day changes. The window covers TREND_MONTHS months ending at
  // the current month (oldest = subMonths(today, TREND_MONTHS - 1)).
  const { currentPeriod, periods, dateFrom, dateTo } = useMemo(() => {
    const oldest = subMonths(today, TREND_MONTHS - 1);
    const from = formatDate(startOfMonth(oldest), 'yyyy-MM-dd');
    const to = formatDate(endOfMonth(today), 'yyyy-MM-dd');
    const cp = formatDate(today, 'yyyy-MM');
    // Build the periods array oldest → newest. Index 0 is TREND_MONTHS-1
    // months back; the last entry is the current month.
    const ps: string[] = [];
    for (let i = TREND_MONTHS - 1; i >= 0; i--) {
      ps.push(formatDate(subMonths(today, i), 'yyyy-MM'));
    }
    return { currentPeriod: cp, periods: ps, dateFrom: from, dateTo: to };
  }, [today]);

  const reload = useCallback(async () => {
    try {
      const [walletsRes, categoriesRes, paymentsRes, expensesRes] =
        await Promise.all([
          // Active only — Insights doesn't surface archived wallets in the
          // by-wallet card. Historical payments still resolve via the sparse
          // map keyed by wallet_id.
          listWallets(db, { includeArchived: false }),
          // Active only — same rationale for categories.
          listCategories(db, { includeArchived: false }),
          // Pull payments across the full 6-month window. Aggregation
          // functions filter in-memory by period.
          listBillPayments(db, {
            paidDateFrom: dateFrom,
            paidDateTo: dateTo,
          }),
          // Anomaly detection needs the full lookback window plus the current
          // month, which fits inside the same 6-month range (lookback = 3,
          // trend = 6). Both share this fetch.
          listExpenses(db, {
            dateFrom,
            dateTo,
          }),
        ]);

      setWallets(walletsRes);
      setCategories(categoriesRes);
      setPayments(paymentsRes);
      setExpenses(expensesRes);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [db, dateFrom, dateTo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  // Headline totals — same function the Wallets tab uses.
  const totals = useMemo<OutflowBreakdown>(() => {
    return getMonthlyOutflowTotal(payments, expenses, currentPeriod);
  }, [payments, expenses, currentPeriod]);

  // Per-wallet rows: full active wallet list + zero fills for unkeyed wallets,
  // sorted by total desc with name asc as the tiebreaker (zeros bubble bottom).
  const walletsByOutflow = useMemo<InsightsWalletRow[]>(() => {
    if (!wallets) return [];
    const map = getMonthlyOutflowByWallet(payments, expenses, currentPeriod);
    const rows = wallets.map<InsightsWalletRow>((w) => ({
      wallet: w,
      breakdown: map.get(w.id) ?? ZERO,
    }));
    rows.sort((a, b) => {
      if (b.breakdown.total !== a.breakdown.total) {
        return b.breakdown.total - a.breakdown.total;
      }
      return a.wallet.name.localeCompare(b.wallet.name);
    });
    return rows;
  }, [wallets, payments, expenses, currentPeriod]);

  // Per-category rows: full active category list + zero fills, sorted by
  // spending desc with sort_order asc as the tiebreaker (zeros bubble bottom
  // in sort_order order, matching the Settings list ordering).
  const categoriesByOutflow = useMemo<InsightsCategoryRow[]>(() => {
    if (!categories) return [];
    const map = getMonthlyOutflowByCategory(expenses, currentPeriod);
    const rows = categories.map<InsightsCategoryRow>((c) => ({
      category: c,
      spending: map.get(c.id) ?? 0,
    }));
    rows.sort((a, b) => {
      if (b.spending !== a.spending) {
        return b.spending - a.spending;
      }
      return a.category.sort_order - b.category.sort_order;
    });
    return rows;
  }, [categories, expenses, currentPeriod]);

  // 6-month trend — getMultiMonthOutflowTrend preserves input order.
  const trend = useMemo<MonthlyOutflowPoint[]>(() => {
    return getMultiMonthOutflowTrend(payments, expenses, periods);
  }, [payments, expenses, periods]);

  // 6-month trend split per wallet, for the chart's stacked bars.
  const trendByWallet = useMemo<PeriodWalletOutflow[]>(() => {
    return getMultiMonthOutflowByWallet(payments, expenses, periods);
  }, [payments, expenses, periods]);

  // Anomalies — already sorted by ratio desc by the aggregation function.
  const anomalies = useMemo<CategoryAnomaly[]>(() => {
    return getCategoryAnomalies(expenses, currentPeriod, ANOMALY_LOOKBACK_MONTHS);
  }, [expenses, currentPeriod]);

  return {
    loading,
    error,
    total: totals.total,
    bills: totals.bills,
    spending: totals.spending,
    walletsByOutflow,
    categoriesByOutflow,
    trend,
    trendByWallet,
    anomalies,
    reload,
  };
}

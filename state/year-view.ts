// Year view v2 state — Zustand store + data hook.
//
// Two layers:
//
//   1. `useYearViewStore` — session-only Zustand store for navigation
//      and expansion state. Holds `displayedYear` and `expandedMonths`.
//      Not persisted: when the user reopens the year view we want them
//      to land on the current year with the current month expanded —
//      the same defaults the redesign spec calls for.
//
//   2. `useYearViewData(db, year)` — data-fetching hook. Loads bills,
//      payments, wallets once; derives the 12-month summaries via
//      `buildMonthSummariesForYear`; returns everything the screen needs
//      to render. Refetches on focus.
//
// The hook deliberately keeps `displayedYear` as a parameter rather than
// reading it from the store internally, so the screen can drive its own
// loading state — the store owns the navigation, the hook owns the data.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { create } from 'zustand';

import type { DB } from '@/db/client';
import { listBills, type Bill } from '@/db/queries/bills';
import { listBillPayments, type BillPayment } from '@/db/queries/bill-payments';
import { listWallets, type Wallet } from '@/db/queries/wallets';
import {
  buildMonthSummariesForYear,
  getYearSummary,
  type MonthSummary,
  type YearSummary,
} from '@/logic/year-view';

// ---------- Navigation / expansion store ----------

interface YearViewStore {
  /** The year the screen is currently displaying. */
  displayedYear: number;
  /** Set of "YYYY-MM" periods the user has expanded. */
  expandedMonths: Set<string>;

  setDisplayedYear: (year: number) => void;
  toggleMonth: (period: string) => void;
  /** Set an initial expansion (e.g. the current month on first paint). */
  setExpandedMonths: (periods: Iterable<string>) => void;
  /** Reset back to defaults — used when the screen re-mounts cleanly. */
  reset: (defaultYear: number) => void;
}

export const useYearViewStore = create<YearViewStore>((set) => ({
  displayedYear: new Date().getFullYear(),
  expandedMonths: new Set(),

  setDisplayedYear: (year) => set({ displayedYear: year }),
  toggleMonth: (period) =>
    set((s) => {
      const next = new Set(s.expandedMonths);
      if (next.has(period)) next.delete(period);
      else next.add(period);
      return { expandedMonths: next };
    }),
  setExpandedMonths: (periods) =>
    set({ expandedMonths: new Set(periods) }),
  reset: (defaultYear) =>
    set({ displayedYear: defaultYear, expandedMonths: new Set() }),
}));

// ---------- Data hook ----------

export interface YearViewData {
  loading: boolean;
  error: Error | null;
  /** Length-12 array, January→December. */
  monthSummaries: MonthSummary[];
  /** Aggregated totals for the top summary card. */
  yearSummary: YearSummary;
  /** Wallet lookup for the date strip + bill row rendering. */
  walletsById: Map<string, Wallet>;
  /**
   * Earliest year that has at least one BillPayment record. The
   * year switcher uses this to fade the `‹` arrow when the user is
   * already on the boundary. Null when there are no payments yet —
   * the switcher treats null as "this year is the boundary."
   */
  earliestYearWithData: number | null;
  /** Active bills only, sorted by name asc — for ad-hoc lookups. */
  bills: Bill[];
  reload: () => Promise<void>;
}

export function useYearViewData(db: DB, year: number, today: Date): YearViewData {
  const [bills, setBills] = useState<Bill[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [allPayments, setAllPayments] = useState<BillPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    try {
      const [billsRes, walletsRes, paymentsRes] = await Promise.all([
        // Active bills only — the year view hides archived bills from
        // active surfaces, same as the Bills tab.
        listBills(db, {}),
        // Archived wallets included so historical payments still
        // resolve their wallet brand colour (DATA_MODEL §"Archived
        // entities preserve history").
        listWallets(db, { includeArchived: true }),
        // All-time payments. Volumes are small (hundreds, max), and
        // the year filter has to be applied per-bill below.
        listBillPayments(db, {}),
      ]);
      // Sort bills by name asc for stable ordering across all the cells.
      const billsSorted = [...billsRes].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      setBills(billsSorted);
      setWallets(walletsRes);
      setAllPayments(paymentsRes);
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

  // Pre-compute the two per-bill maps the logic layer wants. Recomputes
  // when payments OR year changes so the user can flip years without
  // re-fetching.
  const paymentsByBillByPeriod = useMemo(() => {
    const yearPrefix = `${year}-`;
    const out = new Map<string, Map<string, BillPayment>>();
    for (const p of allPayments) {
      if (!p.period.startsWith(yearPrefix)) continue;
      let inner = out.get(p.bill_id);
      if (!inner) {
        inner = new Map();
        out.set(p.bill_id, inner);
      }
      inner.set(p.period, p);
    }
    return out;
  }, [allPayments, year]);

  const recentPaymentsByBill = useMemo(() => {
    const grouped = new Map<string, BillPayment[]>();
    for (const p of allPayments) {
      const arr = grouped.get(p.bill_id);
      if (arr) arr.push(p);
      else grouped.set(p.bill_id, [p]);
    }
    const recent = new Map<string, BillPayment[]>();
    for (const [billId, arr] of grouped) {
      recent.set(
        billId,
        [...arr].sort((a, b) => b.period.localeCompare(a.period)).slice(0, 3),
      );
    }
    return recent;
  }, [allPayments]);

  const monthSummaries = useMemo(
    () =>
      buildMonthSummariesForYear(
        year,
        today,
        bills,
        paymentsByBillByPeriod,
        recentPaymentsByBill,
      ),
    [year, today, bills, paymentsByBillByPeriod, recentPaymentsByBill],
  );

  const yearSummary = useMemo(
    () => getYearSummary(year, today, monthSummaries),
    [year, today, monthSummaries],
  );

  const walletsById = useMemo(
    () => new Map(wallets.map((w) => [w.id, w])),
    [wallets],
  );

  const earliestYearWithData = useMemo<number | null>(() => {
    if (allPayments.length === 0) return null;
    let min = Number.POSITIVE_INFINITY;
    for (const p of allPayments) {
      // Period is YYYY-MM; the first four chars are the year.
      const y = Number(p.period.slice(0, 4));
      if (Number.isFinite(y) && y < min) min = y;
    }
    return Number.isFinite(min) ? min : null;
  }, [allPayments]);

  return {
    loading,
    error,
    monthSummaries,
    yearSummary,
    walletsById,
    earliestYearWithData,
    bills,
    reload,
  };
}

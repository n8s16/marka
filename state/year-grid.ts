// Hook: derive the data for the Year grid screen.
//
// Per docs/PRD.md §"Supporting screens" — Year grid and docs/DATA_MODEL.md
// §"Year grid cell resolution", the screen renders a `bills × months` matrix
// for a single calendar year. Each cell resolves to one of:
//
//   - paid:     a BillPayment exists for (bill, period)
//   - forecast: the period is a due-period for the bill but unpaid
//   - not_due:  the period is not a due-period for the bill (cadence skip)
//
// The cell resolver `getYearGridCell` (in /logic/year-grid.ts) is called once
// per cell during render, but the per-bill structures it depends on must be
// pre-built ONCE per bill — failing to do so is O(bills × months × payments)
// instead of O(bills × payments) one-time + O(1) per cell.
//
// This hook is the place that pre-builds them:
//   - paymentsByBillByPeriod: Map<billId, Map<period, BillPayment>>
//   - recentPaymentsByBill:   Map<billId, BillPayment[]> — last 3 by period desc
//
// We pull ALL bill_payments for the year (filtered in-memory by
// `period.startsWith('YYYY-')`) rather than going through the paid_date range
// filter, because a January period can legitimately be paid in the previous
// December (e.g. early payment) — so the period-side filter is the canonical
// one for the year grid. Volumes are small enough that a full-table scan is
// fine.
//
// Re-fetches happen on mount and when the screen regains focus
// (useFocusEffect). Mirrors the shape of the other screen-level hooks
// (state/bills-current-month.ts, state/transfers-history.ts).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { DB } from '@/db/client';

import { listBills, type Bill } from '@/db/queries/bills';
import { listBillPayments, type BillPayment } from '@/db/queries/bill-payments';
import { listWallets, type Wallet } from '@/db/queries/wallets';

export interface YearGridState {
  loading: boolean;
  error: Error | null;
  bills: Bill[];
  walletsById: Map<string, Wallet>;
  paymentsByBillByPeriod: Map<string, Map<string, BillPayment>>;
  recentPaymentsByBill: Map<string, BillPayment[]>;
  reload: () => Promise<void>;
}

export function useYearGrid(
  db: DB,
  year: number,
): YearGridState {
  const [bills, setBills] = useState<Bill[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [allPayments, setAllPayments] = useState<BillPayment[]>([]);
  const [recentPaymentsByBill, setRecentPaymentsByBill] = useState<
    Map<string, BillPayment[]>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    try {
      const [billsRes, walletsRes, paymentsRes] = await Promise.all([
        // Active bills only — archived bills don't appear in the year grid
        // (per PRD: archived doesn't mean deleted, but the UI hides them
        // from active surfaces).
        listBills(db, {}),
        // Include archived wallets so historical payments still resolve
        // their wallet brand color (per DATA_MODEL "Archived entities
        // preserve history").
        listWallets(db, { includeArchived: true }),
        // All-time payments. The volume is small (hundreds, max). The
        // alternative — paid_date range filter — would miss payments whose
        // period falls in <year> but were paid in an adjacent year. The
        // canonical filter for the year grid is `period`, not `paid_date`.
        listBillPayments(db, {}),
      ]);

      // Sort bills by name asc for stable, scannable row order.
      const billsSorted = [...billsRes].sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      // Group payments by bill_id so we can both:
      //   - filter to <year> for the per-cell map
      //   - take the last 3 by period desc (used as auto-forecast input,
      //     regardless of which year they fall in)
      const byBillId = new Map<string, BillPayment[]>();
      for (const p of paymentsRes) {
        const arr = byBillId.get(p.bill_id);
        if (arr) arr.push(p);
        else byBillId.set(p.bill_id, [p]);
      }

      const recentMap = new Map<string, BillPayment[]>();
      for (const bill of billsSorted) {
        const arr = byBillId.get(bill.id) ?? [];
        const sorted = [...arr].sort((a, b) =>
          b.period.localeCompare(a.period),
        );
        recentMap.set(bill.id, sorted.slice(0, 3));
      }

      setBills(billsSorted);
      setWallets(walletsRes);
      setAllPayments(paymentsRes);
      setRecentPaymentsByBill(recentMap);
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

  // Year-scoped per-cell lookup. Recomputes when `year` changes (so the
  // user can flip years without re-querying) and when payments change.
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

  const walletsById = useMemo(
    () => new Map(wallets.map((w) => [w.id, w])),
    [wallets],
  );

  return {
    loading,
    error,
    bills,
    walletsById,
    paymentsByBillByPeriod,
    recentPaymentsByBill,
    reload,
  };
}

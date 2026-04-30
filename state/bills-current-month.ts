// Hook: derive the current-month bill list for the Bills tab.
//
// What "current month" means here matches docs/PRD.md §"Main tabs": the
// summary card + list show the current calendar month from the user's
// device clock. For each non-archived bill we resolve its current period
// (the period containing today's month if it's a due-period for the bill,
// else the most recent prior due-period), look up any matching BillPayment,
// and compute its BillStatus.
//
// The hook returns:
//   - entries: rows ready to render. 'not_due' and 'future' are filtered out
//     (year grid handles those).
//   - paidTotal / expectedTotal: pre-summed centavos for the summary card.
//   - reminderEntry: the soonest active reminder among `kind: 'upcoming'`
//     rows, or null.
//   - loading / error / reload: standard async-state plumbing.
//
// Re-fetches happen on mount and when the screen regains focus
// (useFocusEffect). The caller is the only place that knows the screen has
// focus; we accept that contract by exposing a `reload` callback.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import { listBills, type Bill } from '@/db/queries/bills';
import {
  getBillPaymentByBillAndPeriod,
  listBillPayments,
  type BillPayment,
} from '@/db/queries/bill-payments';
import { listWallets, type Wallet } from '@/db/queries/wallets';
import { getBillStatusForPeriod, type BillStatus } from '@/logic/bill-status';
import { getForecastForBill } from '@/logic/forecasts';
import {
  getPrevDuePeriod,
  isPeriodDueForBill,
  listDuePeriodsInRange,
} from '@/logic/periods';

export type BillRowEntry = {
  bill: Bill;
  period: string;
  status: BillStatus;
  amount: number;
  paidWallet?: Wallet;
};

export interface BillsCurrentMonthState {
  loading: boolean;
  error: Error | null;
  entries: BillRowEntry[];
  paidTotal: number;
  expectedTotal: number;
  reminderEntry: BillRowEntry | null;
  reload: () => Promise<void>;
}

function todayPeriodString(today: Date): string {
  const y = today.getFullYear();
  const m = (today.getMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Resolve the "current period" for a bill: the period containing today's
 * calendar month if it's a due-period, else the most recent prior due-period.
 * Returns null when the bill has no due-period at or before today's month
 * (e.g. quarterly bill with start_period in the future).
 */
function currentPeriodForBill(bill: Bill, today: Date): string | null {
  const tp = todayPeriodString(today);
  if (isPeriodDueForBill(bill, tp)) return tp;

  const prev = getPrevDuePeriod(bill, tp);
  if (prev) return prev;

  // Defensive: range scan from start_period catches anything getPrevDuePeriod
  // missed. If still empty, the bill simply has no current period yet.
  const window = listDuePeriodsInRange(bill, bill.start_period, tp);
  if (window.length > 0) return window[window.length - 1];
  return null;
}

export function useBillsCurrentMonth(
  db: ExpoSQLiteDatabase,
  today: Date,
): BillsCurrentMonthState {
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [wallets, setWallets] = useState<Wallet[] | null>(null);
  const [paymentByBillId, setPaymentByBillId] = useState<
    Map<string, BillPayment>
  >(new Map());
  const [recentPaymentsByBillId, setRecentPaymentsByBillId] = useState<
    Map<string, BillPayment[]>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    try {
      const [billsRes, walletsRes] = await Promise.all([
        listBills(db, {}),
        // includeArchived: true so historical references resolve (per
        // DATA_MODEL "Archived entities preserve history").
        listWallets(db, { includeArchived: true }),
      ]);

      const periodPairs = billsRes
        .map((b) => {
          const period = currentPeriodForBill(b, today);
          return period ? { bill: b, period } : null;
        })
        .filter((x): x is { bill: Bill; period: string } => x !== null);

      const payments = await Promise.all(
        periodPairs.map((p) =>
          getBillPaymentByBillAndPeriod(db, p.bill.id, p.period),
        ),
      );

      const map = new Map<string, BillPayment>();
      periodPairs.forEach((pair, i) => {
        const pmt = payments[i];
        if (pmt) map.set(pair.bill.id, pmt);
      });

      // Pull the last 3 payments per bill (by period desc) so the unpaid-row
      // forecast can use the rolling-average path when bill.auto_forecast.
      // Intentionally N+1: dozens of bills max in v1; a single grouped query
      // (window function or subquery) is a future optimisation if perf bites.
      const recentPaymentsList = await Promise.all(
        billsRes.map((b) => listBillPayments(db, { billId: b.id })),
      );
      const recentMap = new Map<string, BillPayment[]>();
      billsRes.forEach((b, i) => {
        const sorted = [...recentPaymentsList[i]].sort((a, b) =>
          b.period.localeCompare(a.period),
        );
        recentMap.set(b.id, sorted.slice(0, 3));
      });

      setBills(billsRes);
      setWallets(walletsRes);
      setPaymentByBillId(map);
      setRecentPaymentsByBillId(recentMap);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [db, today]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const entries: BillRowEntry[] = useMemo(() => {
    if (!bills || !wallets) return [];
    const walletById = new Map(wallets.map((w) => [w.id, w]));
    const out: BillRowEntry[] = [];

    for (const bill of bills) {
      const period = currentPeriodForBill(bill, today);
      if (!period) continue;

      const payment = paymentByBillId.get(bill.id);
      const status = getBillStatusForPeriod(bill, period, today, payment);

      // 'not_due' and 'future' don't belong on the current-month tab.
      if (status.kind === 'not_due') continue;
      if (status.kind === 'future') continue;

      const amount =
        status.kind === 'paid'
          ? status.payment.amount
          : getForecastForBill(
              bill,
              recentPaymentsByBillId.get(bill.id) ?? [],
            );

      const paidWallet =
        status.kind === 'paid'
          ? walletById.get(status.payment.wallet_id)
          : undefined;

      out.push({ bill, period, status, amount, paidWallet });
    }
    return out;
  }, [bills, wallets, paymentByBillId, recentPaymentsByBillId, today]);

  const { paidTotal, expectedTotal } = useMemo(() => {
    let paid = 0;
    let expected = 0;
    for (const e of entries) {
      expected += e.amount;
      if (e.status.kind === 'paid') paid += e.amount;
    }
    return { paidTotal: paid, expectedTotal: expected };
  }, [entries]);

  const reminderEntry = useMemo<BillRowEntry | null>(() => {
    const upcoming = entries.filter(
      (e) => e.status.kind === 'upcoming' && e.status.reminderActive,
    );
    if (upcoming.length === 0) return null;
    upcoming.sort((a, b) => {
      const da = a.status.kind === 'upcoming' ? a.status.daysUntilDue : 0;
      const db = b.status.kind === 'upcoming' ? b.status.daysUntilDue : 0;
      return da - db;
    });
    return upcoming[0];
  }, [entries]);

  return {
    loading,
    error,
    entries,
    paidTotal,
    expectedTotal,
    reminderEntry,
    reload,
  };
}

// Hook: derive the current-month expense list for the Spending tab.
//
// What "current month" means here matches docs/PRD.md §"Main tabs" — Spending:
// the list and summary card show one-off expenses with `date` in the current
// calendar month from the user's device clock.
//
// The hook returns:
//   - expenses: rows ready to render, ordered by date desc then created_at
//     desc (the underlying query enforces this).
//   - walletsById / categoriesById: lookup maps so the row component can
//     resolve wallet brand color and category name without re-querying.
//     Wallets include archived ones so historical expense rows still resolve
//     their wallet (per DATA_MODEL.md "Archived entities preserve history").
//   - monthlyTotal: sum of non-null `amount` values in centavos. Per
//     DATA_MODEL.md, expense.amount is nullable; null entries are placeholders
//     and don't contribute to the total — they still render in the list.
//   - loading / error / reload: standard async-state plumbing, mirrors
//     `state/bills-current-month.ts` and `state/wallets-current-month.ts`.
//
// Re-fetches happen on mount and when the screen regains focus
// (useFocusEffect). The caller (the Spending tab screen) is the only place
// that knows the screen has focus; we accept that contract by exposing a
// `reload` callback.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { endOfMonth, format as formatDate, startOfMonth } from 'date-fns';

import { listCategories, type Category } from '@/db/queries/categories';
import { listExpenses, type Expense } from '@/db/queries/expenses';
import { listWallets, type Wallet } from '@/db/queries/wallets';

export interface ExpensesCurrentMonthState {
  loading: boolean;
  error: Error | null;
  expenses: Expense[];
  walletsById: Map<string, Wallet>;
  categoriesById: Map<string, Category>;
  /** Sum of non-null `amount` values in centavos. */
  monthlyTotal: number;
  reload: () => Promise<void>;
}

export function useExpensesCurrentMonth(
  db: ExpoSQLiteDatabase,
  today: Date,
): ExpensesCurrentMonthState {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Derive month-window strings once per `today` change so the reload
  // callback's identity only flips when the date does.
  const { dateFrom, dateTo } = useMemo(() => {
    const from = formatDate(startOfMonth(today), 'yyyy-MM-dd');
    const to = formatDate(endOfMonth(today), 'yyyy-MM-dd');
    return { dateFrom: from, dateTo: to };
  }, [today]);

  const reload = useCallback(async () => {
    try {
      const [expensesRes, walletsRes, categoriesRes] = await Promise.all([
        listExpenses(db, { dateFrom, dateTo }),
        // includeArchived: true so historical expense rows still resolve
        // their wallet (per DATA_MODEL.md "Archived entities preserve
        // history"). The wallet picker on the Add/Edit form pulls active-
        // only separately.
        listWallets(db, { includeArchived: true }),
        // Same rationale for categories — a row tagged to an archived
        // category should still show its name.
        listCategories(db, { includeArchived: true }),
      ]);
      setExpenses(expensesRes);
      setWallets(walletsRes);
      setCategories(categoriesRes);
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

  const walletsById = useMemo(
    () => new Map(wallets.map((w) => [w.id, w])),
    [wallets],
  );

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const monthlyTotal = useMemo(() => {
    let total = 0;
    for (const e of expenses) {
      // Skip placeholders (amount === null) per DATA_MODEL.md — they appear
      // in the list but don't contribute to the monthly total.
      if (e.amount !== null && e.amount !== undefined) {
        total += e.amount;
      }
    }
    return total;
  }, [expenses]);

  return {
    loading,
    error,
    expenses,
    walletsById,
    categoriesById,
    monthlyTotal,
    reload,
  };
}

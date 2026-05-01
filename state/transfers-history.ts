// Hook: derive the all-time transfer history for the Transfers screen.
//
// Per docs/PRD.md §"Supporting screens" — Transfers history and DECISIONS §26,
// the transfers list shows ALL transfers across time, not just the current
// month. Transfers are infrequent enough that a month filter would frequently
// render empty; an all-time list scrolls fine until volumes get large.
//
// The hook returns:
//   - transfers: rows ready to render, ordered by `date` desc then
//     `created_at` desc (the underlying listTransfers query enforces this).
//   - walletsById: lookup map so the row component can resolve from/to
//     wallet names without re-querying. Includes archived wallets so a
//     transfer routed to a since-archived wallet still resolves its name
//     (per DATA_MODEL.md "Archived entities preserve history").
//   - loading / error / reload: standard async-state plumbing, mirrors the
//     other current-month hooks.
//
// Re-fetches happen on mount and when the screen regains focus
// (useFocusEffect). The caller is the screen at /transfers.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import { listTransfers, type Transfer } from '@/db/queries/transfers';
import { listWallets, type Wallet } from '@/db/queries/wallets';

export interface TransfersHistoryState {
  loading: boolean;
  error: Error | null;
  transfers: Transfer[];
  walletsById: Map<string, Wallet>;
  reload: () => Promise<void>;
}

export function useTransfersHistory(
  db: ExpoSQLiteDatabase,
): TransfersHistoryState {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    try {
      const [transfersRes, walletsRes] = await Promise.all([
        // No date filter — listTransfers without dateFrom/dateTo returns all.
        listTransfers(db, {}),
        // includeArchived: true so historical rows still resolve their
        // from/to wallet names.
        listWallets(db, { includeArchived: true }),
      ]);
      setTransfers(transfersRes);
      setWallets(walletsRes);
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

  const walletsById = useMemo(
    () => new Map(wallets.map((w) => [w.id, w])),
    [wallets],
  );

  return {
    loading,
    error,
    transfers,
    walletsById,
    reload,
  };
}

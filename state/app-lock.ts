// App lock state via Zustand.
//
// Mirrors `state/theme.ts`'s shape: a small persisted store backed by
// AsyncStorage so the user's "app lock enabled" preference survives cold
// starts. Only the `enabled` flag is persisted — the in-memory `unlocked`
// state lives inside the lock-gate component because it must reset on every
// background→foreground transition (per docs/PRD.md §"Behavior decisions" —
// App lock).
//
// Default `enabled: false` per the PRD. The user opts in from
// Settings → App lock, where the toggle verifies biometrics work *before*
// committing — see `app/settings/app-lock.tsx`.
//
// PIN fallback is intentionally NOT in v1 — see DECISIONS §27. The store
// is shaped to add a `method: 'biometric' | 'pin'` field later without
// migrating storage (a missing field defaults to biometric).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface AppLockStore {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
}

const useAppLockStore = create<AppLockStore>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (next) => set({ enabled: next }),
    }),
    {
      name: 'marka-app-lock',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the `enabled` flag is persisted. No other fields exist today,
      // but partialize is explicit so future additions (e.g. a method field)
      // can be opted in or out of persistence deliberately.
      partialize: (state) => ({ enabled: state.enabled }),
    },
  ),
);

/**
 * Hook — returns whether app lock is currently enabled. Re-renders on
 * change. Used by the Settings screen and the lock gate.
 */
export const useAppLockEnabled = (): boolean =>
  useAppLockStore((s) => s.enabled);

/**
 * Imperative setter. Use this from the Settings screen *only after* a
 * successful biometric verification (when flipping ON), or unconditionally
 * (when flipping OFF). The lock gate also calls this — never directly; it
 * reads `enabled` only.
 */
export const setAppLockEnabled = (next: boolean): void =>
  useAppLockStore.getState().setEnabled(next);

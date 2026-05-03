// App lock state via Zustand.
//
// Two pieces of state:
//
//   - `enabled` — persisted via AsyncStorage. Whether the user has opted
//     into app lock at all. Default false. Survives cold starts.
//
//   - `unlocked` — transient, NOT persisted. Whether the user is currently
//     in a verified session. Defaults to false on cold start so the lock
//     screen surfaces immediately. Flips to true on successful biometric
//     auth. Flips to false when the app backgrounds (so the next
//     foreground re-locks).
//
// Why `unlocked` lives in the store instead of inside the gate's local
// state: when Settings flips `enabled` on after a successful auth, we
// need to mark the session unlocked atomically — local-state useEffects
// fire AFTER the gate's render decision, which produces a brief race
// where the LockScreen mounts and auto-prompts a SECOND time before the
// just-enabled detector can stop it. Putting both flips in the store
// (via `enableAndUnlock()`) makes the gate's next render see the
// already-unlocked state synchronously.
//
// Default `enabled: false` per docs/PRD.md §"Behavior decisions" —
// App lock. PIN fallback is intentionally NOT in v1 — see DECISIONS §27.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface AppLockStore {
  enabled: boolean;
  unlocked: boolean;
  setEnabled: (next: boolean) => void;
  setUnlocked: (next: boolean) => void;
  /**
   * Atomic helper — flips `enabled` to true AND marks the session
   * `unlocked` in the same store mutation. Use this from Settings on
   * successful verify-before-commit so the gate doesn't briefly think
   * the user is locked out of the screen they're standing on.
   */
  enableAndUnlock: () => void;
}

const useAppLockStore = create<AppLockStore>()(
  persist(
    (set) => ({
      enabled: false,
      unlocked: false,
      setEnabled: (next) => set({ enabled: next }),
      setUnlocked: (next) => set({ unlocked: next }),
      enableAndUnlock: () => set({ enabled: true, unlocked: true }),
    }),
    {
      name: 'marka-app-lock',
      storage: createJSONStorage(() => AsyncStorage),
      // Only `enabled` is persisted. `unlocked` MUST reset on every cold
      // start so the user re-authenticates — persisting it would defeat
      // the lock entirely.
      partialize: (state) => ({ enabled: state.enabled }),
      // Defer hydration to the client — see state/onboarding.ts for the
      // SSR rationale.
      skipHydration: true,
    },
  ),
);

/** Hook — returns whether app lock is currently enabled. Re-renders on change. */
export const useAppLockEnabled = (): boolean =>
  useAppLockStore((s) => s.enabled);

/** Hook — returns whether the current session is unlocked. Re-renders on change. */
export const useAppLockUnlocked = (): boolean =>
  useAppLockStore((s) => s.unlocked);

/**
 * Imperative — flip the persisted `enabled` flag. Used by Settings only
 * for toggling OFF (no biometric prompt needed) and by the gate for any
 * write that doesn't also affect `unlocked`. For the toggle-ON success
 * path, prefer `enableAndUnlock` so the gate doesn't double-prompt.
 */
export const setAppLockEnabled = (next: boolean): void =>
  useAppLockStore.getState().setEnabled(next);

/**
 * Imperative — flip the transient `unlocked` flag. Used by the lock
 * gate's auto-prompt success path and by the AppState listener (false on
 * background). Settings should NOT call this directly — use
 * `enableAndUnlock` instead.
 */
export const setAppLockUnlocked = (next: boolean): void =>
  useAppLockStore.getState().setUnlocked(next);

/**
 * Imperative — flip both `enabled: true` AND `unlocked: true` atomically.
 * Settings calls this from the toggle-ON success path so the gate's
 * next render sees the user as already-verified, avoiding a second
 * biometric prompt on a screen the user is actively standing on.
 */
export const enableAndUnlockAppLock = (): void =>
  useAppLockStore.getState().enableAndUnlock();

/** Trigger hydration. Safe to call multiple times — Zustand no-ops on repeats. */
export const rehydrateAppLockStore = (): Promise<void> | void =>
  useAppLockStore.persist.rehydrate();

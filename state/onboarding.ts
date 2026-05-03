// Onboarding completion flag.
//
// Per docs/PRD.md §"Onboarding (first run only)" — the two-step flow (pick
// wallets → add first bill) runs once per install. After that, the app boots
// straight to the Bills tab.
//
// We persist the flag in AsyncStorage rather than infer "first run" from the
// DB. Inferring from DB state was tempting (no wallets → fresh install) but
// fragile: starter categories are auto-seeded at boot, so a parallel signal
// for wallets felt like a layering violation. A persisted flag is also
// resilient to backfill edge cases (e.g. user clears bills mid-session).
//
// Existing users (who have wallets/bills before this flag existed) are
// migrated silently in `app/index.tsx`: on first boot post-update, if the
// flag is unset and any wallet exists, we flip it true and proceed to the
// app normally. Genuine fresh installs land in /onboarding.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface OnboardingStore {
  hasCompletedOnboarding: boolean;
  /**
   * Indicates the persisted store has finished hydrating from AsyncStorage.
   * Until this is true, `hasCompletedOnboarding` reflects the in-memory
   * default (`false`) rather than the user's saved value, which would
   * incorrectly route existing users into onboarding for one frame.
   */
  hydrated: boolean;
  setCompleted: (next: boolean) => void;
}

const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      hydrated: false,
      setCompleted: (next) => set({ hasCompletedOnboarding: next }),
    }),
    {
      name: 'marka-onboarding',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the flag itself. `hydrated` is a runtime-only marker.
      partialize: (state) => ({
        hasCompletedOnboarding: state.hasCompletedOnboarding,
      }),
      // Skip auto-hydration so we don't hit AsyncStorage during static
      // rendering (where `window` doesn't exist). Hydration is triggered
      // explicitly from a client-only useEffect — see hydrateAllStores().
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        // Mark hydration done after rehydrate finishes (success or failure).
        state?.setCompleted(state.hasCompletedOnboarding);
        useOnboardingStore.setState({ hydrated: true });
      },
    },
  ),
);

/** Hook — re-renders on completion-flag changes. */
export const useHasCompletedOnboarding = (): boolean =>
  useOnboardingStore((s) => s.hasCompletedOnboarding);

/** Hook — re-renders once the persisted flag has rehydrated from AsyncStorage. */
export const useOnboardingHydrated = (): boolean =>
  useOnboardingStore((s) => s.hydrated);

/** Imperative — flip the persisted flag. */
export const setOnboardingCompleted = (next: boolean): void =>
  useOnboardingStore.getState().setCompleted(next);

/** Trigger hydration. Safe to call multiple times — Zustand no-ops on repeats. */
export const rehydrateOnboardingStore = (): Promise<void> | void =>
  useOnboardingStore.persist.rehydrate();

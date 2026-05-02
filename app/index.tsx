// Root route — gates between onboarding and the bills tab.
//
// Three boot states for `/`:
//
//   1. Onboarding store hasn't rehydrated yet → render nothing (a flash of
//      either route would route the user incorrectly for one frame).
//   2. `hasCompletedOnboarding` is true → redirect to /(tabs)/bills.
//   3. Flag is false → check the DB for any wallet:
//        - If a wallet exists → existing user predating the flag (or a user
//          who reinstalled and synced their data); silently flip the flag
//          to true and continue to /(tabs)/bills.
//        - If no wallets → genuine fresh install; redirect to
//          /onboarding/pick-wallets.
//
// We pick "any wallet exists" rather than "any bill exists" as the
// existing-user signal: the wallet-seeding step ran on every prior boot, so
// a seeded user has wallets even if they never actually used the app —
// keeping the conservative guarantee that we never re-onboard someone who's
// already been booted into the app once.

import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, type RelativePathString } from 'expo-router';

import { useDb } from '@/db/client';
import { listWallets } from '@/db/queries/wallets';
import {
  setOnboardingCompleted,
  useHasCompletedOnboarding,
  useOnboardingHydrated,
} from '@/state/onboarding';
import { useTheme } from '@/state/theme';

const BILLS_PATH = '/(tabs)/bills' as RelativePathString;
const ONBOARDING_PATH = '/onboarding/pick-wallets' as RelativePathString;

type Decision = 'pending' | 'bills' | 'onboarding';

export default function Index() {
  const theme = useTheme();
  const db = useDb();
  const hydrated = useOnboardingHydrated();
  const completed = useHasCompletedOnboarding();
  const [decision, setDecision] = useState<Decision>('pending');

  useEffect(() => {
    if (!hydrated) return;
    if (completed) {
      setDecision('bills');
      return;
    }
    let cancelled = false;
    // Include archived so an existing user who archived all their wallets
    // still counts as "already booted past onboarding once."
    listWallets(db, { includeArchived: true })
      .then((rows) => {
        if (cancelled) return;
        if (rows.length > 0) {
          setOnboardingCompleted(true);
          setDecision('bills');
        } else {
          setDecision('onboarding');
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Fail open into onboarding rather than the app — the worst case
        // for a fresh install with a transient DB hiccup is one extra
        // wallet-pick step.
        setDecision('onboarding');
      });
    return () => {
      cancelled = true;
    };
  }, [db, hydrated, completed]);

  if (decision === 'pending') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.bg }]}>
        <ActivityIndicator color={theme.colors.text} />
      </View>
    );
  }

  return (
    <Redirect href={decision === 'bills' ? BILLS_PATH : ONBOARDING_PATH} />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

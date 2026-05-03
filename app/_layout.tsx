// Root navigator for Marka.
//
// Layers, outermost first:
//   1. GestureHandlerRootView — required by react-native-gesture-handler so
//      swipe gestures (e.g. swipe-to-reveal actions on bill rows) propagate
//      correctly to the gesture-handler runtime. Must wrap the entire app.
//   2. SafeAreaProvider — required for SafeAreaView consumption in screens.
//   3. DatabaseProvider — opens SQLite, runs migrations + seeds, then renders
//      children. Until it resolves it shows a minimal Loading/Error view.
//   4. AppLockGate — when app lock is enabled, conditionally renders a lock
//      screen instead of the Stack until the user authenticates. Pass-through
//      otherwise. StatusBar stays outside so the status-bar style is correct
//      even on the lock screen.
//   5. Stack — Expo Router's default; `(tabs)` becomes a group route. Theme
//      is consumed inside screens via `useTheme()` from state/theme.

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLockGate } from '@/components/app-lock-gate';
import { DatabaseProvider } from '@/db/client';
import { rehydrateAppLockStore } from '@/state/app-lock';
import { rehydrateOnboardingStore } from '@/state/onboarding';
import { rehydrateThemeStore } from '@/state/theme';

export default function RootLayout() {
  // Trigger AsyncStorage rehydration once, client-side only. Stores are
  // configured with skipHydration:true so they don't auto-hit AsyncStorage
  // during static rendering (where `window` is undefined). Doing it from a
  // useEffect guarantees a client environment.
  useEffect(() => {
    void rehydrateOnboardingStore();
    void rehydrateAppLockStore();
    void rehydrateThemeStore();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DatabaseProvider>
          <AppLockGate>
            <Stack screenOptions={{ headerShown: false }} />
          </AppLockGate>
          <StatusBar style="auto" />
        </DatabaseProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

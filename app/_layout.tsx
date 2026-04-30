// Root navigator for Marka.
//
// Layers, outermost first:
//   1. SafeAreaProvider — required for SafeAreaView consumption in screens.
//   2. DatabaseProvider — opens SQLite, runs migrations + seeds, then renders
//      children. Until it resolves it shows a minimal Loading/Error view.
//   3. Stack — Expo Router's default; `(tabs)` becomes a group route. Theme
//      is consumed inside screens via `useTheme()` from state/theme.

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DatabaseProvider } from '@/db/client';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <DatabaseProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="auto" />
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}

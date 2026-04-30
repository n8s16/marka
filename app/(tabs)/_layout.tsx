// Bottom tab navigator for Marka's four main tabs.
//
// Per docs/PRD.md §"Main tabs": Bills, Spending, Wallets, Insights — sticky
// bottom navigation. Labels are sentence case. We deliberately use plain text
// labels (no icons) for v1: PRD locks scope tightly and `expo-symbols`/
// `@expo/vector-icons` are not in the dep list. The user can add icons later
// without restructuring this file.

import { Tabs } from 'expo-router';

import { useTheme } from '@/state/theme';

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: {
          fontSize: theme.typography.label.md.fontSize,
          fontWeight: theme.typography.weights.medium,
        },
      }}
    >
      <Tabs.Screen name="bills" options={{ title: 'Bills' }} />
      <Tabs.Screen name="spending" options={{ title: 'Spending' }} />
      <Tabs.Screen name="wallets" options={{ title: 'Wallets' }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
    </Tabs>
  );
}

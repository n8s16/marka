// Bottom tab navigator for Marka's four main tabs.
//
// Per docs/PRD.md §"Main tabs": Bills, Spending, Wallets, Insights — sticky
// bottom navigation. Labels are sentence case.
//
// Icons come from Ionicons (`@expo/vector-icons`), which is already a
// transitive dep of expo-router — no extra install needed. Outline glyphs
// when inactive, filled when active, the iOS Tab Bar convention.
//   - Bills: receipt → receipt outline
//   - Spending: cart
//   - Wallets: wallet
//   - Insights: bar-chart (stats-chart)

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/state/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ICON_SIZE = 22;
// Baseline tab bar height before adding the bottom safe-area inset.
// React Navigation defaults to ~49pt on iOS / 56dp on Android natively,
// but on web/PWA it doesn't auto-account for the iPhone home indicator
// zone. We compute height as base + insets.bottom and apply
// paddingBottom = insets.bottom so the icons + labels render fully
// above the indicator. 56 keeps comfortable touch targets.
const BASE_TAB_HEIGHT = 56;

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  function makeIcon(active: IconName, inactive: IconName) {
    return ({ focused, color }: { focused: boolean; color: string }) => (
      <Ionicons
        name={focused ? active : inactive}
        size={ICON_SIZE}
        color={color}
      />
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: BASE_TAB_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: {
          fontSize: theme.typography.label.md.fontSize,
          fontWeight: theme.typography.weights.medium,
        },
      }}
    >
      <Tabs.Screen
        name="bills"
        options={{
          title: 'Bills',
          tabBarIcon: makeIcon('receipt', 'receipt-outline'),
        }}
      />
      <Tabs.Screen
        name="spending"
        options={{
          title: 'Spending',
          tabBarIcon: makeIcon('cart', 'cart-outline'),
        }}
      />
      <Tabs.Screen
        name="wallets"
        options={{
          title: 'Wallets',
          tabBarIcon: makeIcon('wallet', 'wallet-outline'),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: makeIcon('stats-chart', 'stats-chart-outline'),
        }}
      />
    </Tabs>
  );
}

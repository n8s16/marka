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

import { useTheme } from '@/state/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ICON_SIZE = 22;

export default function TabsLayout() {
  const theme = useTheme();

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
          // Asymmetric padding by design: extra bottom space pushes
          // the labels up and away from the iOS home-gesture zone at
          // the very bottom of the screen. Without this buffer, the
          // labels sit close enough to the edge that taps on
          // "Wallets" / "Insights" intermittently register as the
          // iOS home swipe / Siri trigger gesture instead of as taps
          // on the tab. spacing.lg (16px) at the bottom against
          // spacing.sm (8px) at the top keeps the icon + label
          // optically centred while still buying the buffer.
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.lg,
          height: 56 + theme.spacing.sm + theme.spacing.lg,
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

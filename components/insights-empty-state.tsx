// Empty state for the Insights tab.
//
// Shown when there is no spending data anywhere in the visible window:
// no bills paid this month, no expenses logged this month, AND the 6-month
// trend has zero total across all six months. The Insights tab is read-
// only, so the empty state is informational rather than a call-to-action
// — users add data from Bills and Spending, not from here.

import { Text, View } from 'react-native';

import { useTheme } from '@/state/theme';

export function InsightsEmptyState() {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.xxl,
        paddingVertical: theme.spacing.xxxl,
      }}
    >
      <Text
        style={[
          theme.typography.body.md,
          { color: theme.colors.textMuted, textAlign: 'center' },
        ]}
      >
        Once you start logging, insights will appear here.
      </Text>
    </View>
  );
}

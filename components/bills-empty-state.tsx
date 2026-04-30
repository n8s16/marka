// Empty state for the Bills tab when no bills exist.
//
// Now that the add-bill form ships with the FAB on the Bills tab, this is
// a simple message with no affordance — the FAB is the only entry point.

import { Text, View } from 'react-native';

import { useTheme } from '@/state/theme';

export function BillsEmptyState() {
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
        No bills yet. Tap + to add your first bill.
      </Text>
    </View>
  );
}

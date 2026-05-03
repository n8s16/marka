// Empty state for the Bills tab when no bills exist.
//
// Now that the add-bill form ships with the FAB on the Bills tab, this is
// a simple message with no affordance — the FAB is the only entry point.
//
// `flex: 1` so the View fills the remaining vertical space inside the
// scroll container; the parent ScrollView is configured with
// `contentContainerStyle.flexGrow = 1` so this actually expands rather
// than collapsing to its content height. Result: the message visually
// centers between the summary card and the bottom tab bar instead of
// hanging just below the card with a sea of empty space underneath.

import { Text, View } from 'react-native';

import { useTheme } from '@/state/theme';

export function BillsEmptyState() {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
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

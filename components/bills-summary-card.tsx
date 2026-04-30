// Summary card at the top of the Bills tab.
//
// Renders the current month label, paid total, and expected total. Numbers
// are derived in the parent screen — this component only formats and lays
// out. Pure presentational; no data fetching.

import { Text, View } from 'react-native';

import { formatCurrency } from '@/logic/currency';
import { useTheme } from '@/state/theme';

export interface BillsSummaryCardProps {
  monthLabel: string;
  paid: number; // centavos
  expected: number; // centavos
}

export function BillsSummaryCard({
  monthLabel,
  paid,
  expected,
}: BillsSummaryCardProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderWidth: theme.borderWidth.hairline,
        borderRadius: theme.radii.md,
        padding: theme.spacing.lg,
        marginHorizontal: theme.spacing.lg,
        marginBottom: theme.spacing.md,
      }}
    >
      <Text
        style={[
          theme.typography.label.md,
          { color: theme.colors.textFaint, textTransform: 'uppercase' },
        ]}
      >
        {monthLabel}
      </Text>
      <Text
        style={[
          theme.typography.title.md,
          { color: theme.colors.text, marginTop: theme.spacing.xs },
        ]}
      >
        {formatCurrency(paid)}{' '}
        <Text
          style={[
            theme.typography.body.md,
            {
              color: theme.colors.textMuted,
              fontWeight: theme.typography.weights.regular,
            },
          ]}
        >
          of {formatCurrency(expected)}
        </Text>
      </Text>
      <Text
        style={[
          theme.typography.label.md,
          { color: theme.colors.textMuted, marginTop: theme.spacing.xs },
        ]}
      >
        Paid this month
      </Text>
    </View>
  );
}

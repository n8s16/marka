// Summary card at the top of the Spending tab.
//
// Mirrors `wallets-summary-card.tsx` and `bills-summary-card.tsx`: a small
// caps month label, a big total, and a sub-label that names the metric.
// Pure presentational — the parent screen derives `total` from the current
// month's expense list (sum of non-null `amount` values).

import { Text, View } from 'react-native';

import { formatCurrency } from '@/logic/currency';
import { useTheme } from '@/state/theme';

export interface SpendingSummaryCardProps {
  monthLabel: string;
  total: number; // centavos
}

export function SpendingSummaryCard({
  monthLabel,
  total,
}: SpendingSummaryCardProps) {
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
        {formatCurrency(total)}
      </Text>
      <Text
        style={[
          theme.typography.label.md,
          { color: theme.colors.textMuted, marginTop: theme.spacing.xs },
        ]}
      >
        Spending this month
      </Text>
    </View>
  );
}

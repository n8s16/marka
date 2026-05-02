// Summary card at the top of the Insights tab.
//
// Mirrors `wallets-summary-card.tsx` and `spending-summary-card.tsx`: a small
// caps month label, a big total, and a sub-label that shows the bills /
// spending split. Pure presentational — the parent screen derives the numbers.

import { Text, View } from 'react-native';

import { formatCurrency } from '@/logic/currency';
import { useTheme } from '@/state/theme';

export interface InsightsSummaryCardProps {
  monthLabel: string;
  bills: number; // centavos
  spending: number; // centavos
  total: number; // centavos
}

export function InsightsSummaryCard({
  monthLabel,
  bills,
  spending,
  total,
}: InsightsSummaryCardProps) {
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
        Bills {formatCurrency(bills)} · Spending {formatCurrency(spending)}
      </Text>
    </View>
  );
}

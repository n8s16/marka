// Summary card at the top of the Wallets tab.
//
// Mirrors `bills-summary-card.tsx`: the month label sits in small caps, the
// big title is the combined "out this month" total, and a sub-label shows
// the bills/spending split. Numbers are derived in the parent screen — this
// component only formats and lays out. Pure presentational; no data fetching.

import { Text, View } from 'react-native';

import { formatCurrency } from '@/logic/currency';
import { useTheme } from '@/state/theme';

export interface WalletsSummaryCardProps {
  monthLabel: string;
  bills: number; // centavos
  spending: number; // centavos
  total: number; // centavos
}

export function WalletsSummaryCard({
  monthLabel,
  bills,
  spending,
  total,
}: WalletsSummaryCardProps) {
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

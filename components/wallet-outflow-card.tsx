// A single per-wallet outflow card in the Wallets tab list.
//
// Visual rules (PRD §"Core design principles" — Brand-color wallet identity,
// Outflow-primary):
//   - 3px left-accent border in the wallet's brand color (Maya/GCash/
//     UnionBank/Cash use their constant brand colors; custom wallets fall
//     through to wallet.color via accentColorFor).
//   - Wallet name in primary text, type as a small muted sub-label.
//   - Right side renders the total outflow this month. When the wallet has
//     zero outflow, the amount renders in `theme.colors.textMuted` (greyed).
//   - The bills/spending split sub-text only renders when total > 0 — keeps
//     zero-outflow rows clean.
//
// No tap target in v1 — read-only card. A future per-wallet detail screen
// would wire it; we don't add a route preemptively.

import { StyleSheet, Text, View } from 'react-native';

import type { Wallet } from '@/db/queries/wallets';
import { formatCurrency } from '@/logic/currency';
import type { OutflowBreakdown } from '@/logic/aggregations';
import { useTheme } from '@/state/theme';
import { accentColorFor } from '@/utils/wallet-color';

export interface WalletOutflowCardProps {
  wallet: Wallet;
  outflow: OutflowBreakdown;
}

// Friendlier label for the wallet's type. The DB stores `e_wallet`, `bank`,
// `cash`; UI shouldn't expose snake_case to the user.
function walletTypeLabel(type: Wallet['type']): string {
  switch (type) {
    case 'e_wallet':
      return 'E-wallet';
    case 'bank':
      return 'Bank';
    case 'cash':
      return 'Cash';
  }
}

export function WalletOutflowCard({
  wallet,
  outflow,
}: WalletOutflowCardProps) {
  const theme = useTheme();
  const accent = accentColorFor(wallet);
  const isZero = outflow.total === 0;

  const amountColor = isZero ? theme.colors.textMuted : theme.colors.text;

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderLeftWidth: accent ? 3 : 0,
          borderLeftColor: accent ?? 'transparent',
          paddingLeft: accent ? theme.spacing.md : theme.spacing.lg,
        },
      ]}
    >
      <View style={styles.left}>
        <Text
          style={[
            theme.typography.body.md,
            { color: theme.colors.text },
          ]}
          numberOfLines={1}
        >
          {wallet.name}
        </Text>
        <Text
          style={[
            theme.typography.label.md,
            { color: theme.colors.textMuted, marginTop: 2 },
          ]}
          numberOfLines={1}
        >
          {walletTypeLabel(wallet.type)}
        </Text>
      </View>
      <View style={styles.right}>
        <Text
          style={[
            theme.typography.body.md,
            {
              color: amountColor,
              fontWeight: theme.typography.weights.medium,
            },
          ]}
        >
          {formatCurrency(outflow.total)}
        </Text>
        {!isZero ? (
          <Text
            style={[
              theme.typography.label.sm,
              { color: theme.colors.textMuted, marginTop: 2 },
            ]}
            numberOfLines={1}
          >
            Bills {formatCurrency(outflow.bills)} · Spending{' '}
            {formatCurrency(outflow.spending)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingRight: 16,
    paddingVertical: 14,
  },
  left: { flex: 1, marginRight: 12 },
  right: { alignItems: 'flex-end' },
});

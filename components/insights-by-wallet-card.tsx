// Per-wallet outflow card on the Insights tab.
//
// Wraps the existing `WalletOutflowCard` rows under a "By wallet" section
// header. The row visual idiom (3px brand-color left accent, name + type on
// the left, amount + bills/spending sub-label on the right) is identical to
// the Wallets tab — Insights restates the same per-wallet breakdown in a
// single read-only card so the user can compare Insights numbers to the
// Wallets tab without context-switching.
//
// Pure presentational. The parent screen passes the full active-wallet list
// (already sorted by outflow desc, zeros at the bottom).

import { StyleSheet, Text, View } from 'react-native';

import { WalletOutflowCard } from '@/components/wallet-outflow-card';
import type { OutflowBreakdown } from '@/logic/aggregations';
import type { Wallet } from '@/db/queries/wallets';
import { useTheme } from '@/state/theme';

export interface InsightsByWalletRow {
  wallet: Wallet;
  breakdown: OutflowBreakdown;
}

export interface InsightsByWalletCardProps {
  rows: InsightsByWalletRow[];
}

export function InsightsByWalletCard({ rows }: InsightsByWalletCardProps) {
  const theme = useTheme();

  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      <Text
        style={[
          theme.typography.label.md,
          styles.header,
          {
            color: theme.colors.textFaint,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.sm,
            paddingBottom: theme.spacing.xs,
          },
        ]}
      >
        By wallet
      </Text>
      {rows.length === 0 ? (
        <View
          style={[
            styles.empty,
            { paddingHorizontal: theme.spacing.xxl, paddingVertical: theme.spacing.xl },
          ]}
        >
          <Text
            style={[
              theme.typography.body.sm,
              { color: theme.colors.textMuted, textAlign: 'center' },
            ]}
          >
            No wallets yet — add one in Settings.
          </Text>
        </View>
      ) : (
        <View
          style={[
            styles.list,
            {
              marginHorizontal: theme.spacing.lg,
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.md,
              borderColor: theme.colors.border,
              borderWidth: theme.borderWidth.hairline,
            },
          ]}
        >
          {rows.map((row) => (
            <WalletOutflowCard
              key={row.wallet.id}
              wallet={row.wallet}
              outflow={row.breakdown}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    textTransform: 'uppercase',
  },
  list: {
    overflow: 'hidden',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

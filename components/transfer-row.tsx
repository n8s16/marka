// A single Transfer row on the Transfers history screen.
//
// Visual: two wallet brand-color dots representing the from/to wallets,
// connected by an arrow ("Maya → GCash"). Amount on the right. If the
// transfer has a free-text note, it appears as a small sub-label.
//
// Tap target: tap → edit form at `/transfers/<id>`. No swipe in v1 — the
// edit form has its own Delete affordance.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { Transfer } from '@/db/queries/transfers';
import type { Wallet } from '@/db/queries/wallets';
import { formatCurrency } from '@/logic/currency';
import { useTheme } from '@/state/theme';
import { accentColorFor } from '@/utils/wallet-color';

export interface TransferRowProps {
  transfer: Transfer;
  // Resolved via a parent-side lookup map. `undefined` only if the FK row
  // was hard-deleted out from under us — normally prevented. Render a
  // graceful fallback rather than crashing.
  fromWallet: Wallet | undefined;
  toWallet: Wallet | undefined;
}

export function TransferRow({
  transfer,
  fromWallet,
  toWallet,
}: TransferRowProps) {
  const router = useRouter();
  const theme = useTheme();
  const fromAccent =
    accentColorFor(fromWallet) ?? theme.walletBrand.fallback;
  const toAccent = accentColorFor(toWallet) ?? theme.walletBrand.fallback;

  const fromName = fromWallet?.name ?? 'Unknown';
  const toName = toWallet?.name ?? 'Unknown';

  function handlePress() {
    router.push({
      pathname: '/transfers/[id]',
      params: { id: transfer.id },
    });
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Transfer of ${formatCurrency(transfer.amount)} from ${fromName} to ${toName}. Tap to edit.`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed
            ? theme.colors.surfaceMuted
            : theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.left}>
        <View style={styles.walletsRow}>
          <View style={[styles.dot, { backgroundColor: fromAccent }]} />
          <Text
            style={[theme.typography.body.md, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            {fromName}
          </Text>
          <Text
            style={[
              theme.typography.body.md,
              { color: theme.colors.textMuted, marginHorizontal: 6 },
            ]}
          >
            →
          </Text>
          <View style={[styles.dot, { backgroundColor: toAccent }]} />
          <Text
            style={[theme.typography.body.md, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            {toName}
          </Text>
        </View>
        {transfer.note ? (
          <Text
            style={[
              theme.typography.label.md,
              { color: theme.colors.textMuted, marginTop: 2 },
            ]}
            numberOfLines={1}
          >
            {transfer.note}
          </Text>
        ) : null}
      </View>
      <Text
        style={[
          theme.typography.body.md,
          {
            color: theme.colors.text,
            fontWeight: theme.typography.weights.medium,
          },
        ]}
      >
        {formatCurrency(transfer.amount)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  left: { flex: 1, marginRight: 12 },
  walletsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
});

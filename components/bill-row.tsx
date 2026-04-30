// A single Bill row in the Bills tab list.
//
// Visual rules (PRD §"Core design principles" + §"Behavior decisions"):
//   - Paid: strikethrough text, opacity 0.55 (theme.opacity.paid), left-accent
//     border in the wallet's brand color. Wallet brand colors are constant
//     across light/dark — they live in theme.walletBrand[key], NOT theme.colors.
//   - Unpaid: full opacity, no strikethrough, no special tint.
//   - Overdue: full opacity; the amount renders in theme.colors.warning to
//     surface "this is late."
//   - Upcoming: full opacity; if reminderActive, render a small sub-label
//     "Reminder in N days."
//   - Future / not_due: deferred — the parent screen filters `not_due` rows
//     and only renders current-period futures (yet to come this build).
//
// Tap targets:
//   - Tap row when status is 'paid' → payment details sheet at
//     `/bills/<id>/payment-details?period=<YYYY-MM>` (decision 24 — split
//     paid vs unpaid intents to avoid accidental double-payment).
//   - Tap row when status is anything else → mark-as-paid sheet at
//     `/bills/<id>/mark-paid`.
//   - Long-press row → edit screen at `/bills/<id>`. Long-press is the chosen
//     edit affordance because the row is a tight target and an "Edit" button
//     would crowd the amount column. The Bills tab also exposes the edit path
//     through the floating + (for create); for now long-press keeps the
//     surface clean.
//
// Business logic stays in /logic. This component only branches on the kind of
// the BillStatus discriminated union and on the wallet color.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { formatCurrency } from '@/logic/currency';
import type { BillStatus } from '@/logic/bill-status';
import type { Wallet } from '@/db/queries/wallets';
import type { Bill } from '@/db/queries/bills';
import { useTheme } from '@/state/theme';
import { accentColorFor } from '@/utils/wallet-color';

export interface BillRowProps {
  bill: Bill;
  // The current period this row represents, e.g. "2026-05". Passed through
  // to the payment-details sheet so it knows which payment to load.
  period: string;
  status: BillStatus;
  // Resolved amount in centavos: payment.amount when paid, forecast otherwise.
  amount: number;
  // Wallet that paid the bill (when status.kind === 'paid'), else undefined.
  paidWallet?: Wallet;
}

export function BillRow({
  bill,
  period,
  status,
  amount,
  paidWallet,
}: BillRowProps) {
  const router = useRouter();
  const theme = useTheme();

  const isPaid = status.kind === 'paid';
  const isOverdue = status.kind === 'overdue';
  const accent = isPaid ? accentColorFor(paidWallet) : null;

  const amountColor = isOverdue ? theme.colors.warning : theme.colors.text;
  const nameColor = theme.colors.text;
  const subColor = theme.colors.textMuted;

  // Sub-label varies by kind. Keep it in this component because it's purely
  // presentational; nothing else needs to know "what string did we show?"
  let subLabel: string | null = null;
  if (status.kind === 'paid' && paidWallet) {
    subLabel = `Paid · ${paidWallet.name}`;
  } else if (status.kind === 'overdue') {
    subLabel = 'Overdue';
  } else if (status.kind === 'upcoming') {
    if (status.reminderActive) {
      subLabel =
        status.daysUntilDue === 0
          ? 'Due today'
          : `Reminder in ${status.daysUntilDue} day${status.daysUntilDue === 1 ? '' : 's'}`;
    } else {
      subLabel =
        status.daysUntilDue === 0
          ? 'Due today'
          : `Due in ${status.daysUntilDue} day${status.daysUntilDue === 1 ? '' : 's'}`;
    }
  } else if (status.kind === 'unpaid') {
    subLabel = 'Unpaid';
  }

  return (
    <Pressable
      onPress={() => {
        if (isPaid) {
          router.push({
            pathname: '/bills/[id]/payment-details',
            params: { id: bill.id, period },
          });
        } else {
          router.push({
            pathname: '/bills/[id]/mark-paid',
            params: { id: bill.id },
          });
        }
      }}
      onLongPress={() =>
        router.push({ pathname: '/bills/[id]', params: { id: bill.id } })
      }
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={
        isPaid
          ? `${bill.name}, ${formatCurrency(amount)}, paid. Tap to view payment details, long press to edit the bill.`
          : `${bill.name}, ${formatCurrency(amount)}. Tap to mark as paid, long press to edit the bill.`
      }
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
          borderColor: theme.colors.border,
          opacity: isPaid ? theme.opacity.paid : 1,
          borderLeftWidth: accent ? 3 : 0,
          borderLeftColor: accent ?? 'transparent',
          paddingLeft: accent ? theme.spacing.md : theme.spacing.lg,
          paddingRight: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
        },
      ]}
    >
      <View style={styles.left}>
        <Text
          style={[
            theme.typography.body.md,
            {
              color: nameColor,
              textDecorationLine: isPaid ? 'line-through' : 'none',
            },
          ]}
          numberOfLines={1}
        >
          {bill.name}
        </Text>
        {subLabel ? (
          <Text
            style={[theme.typography.label.md, { color: subColor, marginTop: 2 }]}
            numberOfLines={1}
          >
            {subLabel}
          </Text>
        ) : null}
      </View>
      <Text
        style={[
          theme.typography.body.md,
          {
            color: amountColor,
            textDecorationLine: isPaid ? 'line-through' : 'none',
            fontWeight: theme.typography.weights.medium,
          },
        ]}
      >
        {formatCurrency(amount)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  left: { flex: 1, marginRight: 12 },
});

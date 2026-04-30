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
//   - Tap the row when status is 'paid' → payment details sheet at
//     `/bills/<id>/payment-details?period=<YYYY-MM>` (decision 24 — split
//     paid vs unpaid intents to avoid accidental double-payment).
//   - Tap the row when status is anything else → mark-as-paid sheet at
//     `/bills/<id>/mark-paid`.
//   - Swipe right-to-left → reveals action buttons. The buttons are status
//     aware: paid bills expose "View" (payment details) plus "Edit"; unpaid
//     bills expose just "Edit". Tapping a revealed action navigates AND
//     closes the swipe so the row settles back into place.
//   - Long-press the row → goes straight to edit. Power-user shortcut kept
//     alongside the swipe affordance for redundancy.
//
// Implementation: the row body is wrapped in a Swipeable from
// `react-native-gesture-handler`. The action buttons are rendered via
// `renderRightActions`. We hold a ref to the swipeable so action handlers
// can call `close()` before navigating — otherwise the row stays open and
// the user comes back from the destination screen to a half-open row.

import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
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
  const swipeableRef = useRef<Swipeable | null>(null);

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

  function handleMainTap() {
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
  }

  function navigateAndClose(action: () => void) {
    swipeableRef.current?.close();
    action();
  }

  function handleEdit() {
    navigateAndClose(() =>
      router.push({ pathname: '/bills/[id]', params: { id: bill.id } }),
    );
  }

  function handleViewPaymentDetails() {
    navigateAndClose(() =>
      router.push({
        pathname: '/bills/[id]/payment-details',
        params: { id: bill.id, period },
      }),
    );
  }

  function renderRightActions() {
    return (
      <View style={styles.actionsRow}>
        {isPaid ? (
          <Pressable
            onPress={handleViewPaymentDetails}
            accessibilityRole="button"
            accessibilityLabel={`View payment details for ${bill.name}`}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: pressed
                  ? theme.colors.surfaceMuted
                  : theme.colors.surface,
                borderLeftColor: theme.colors.border,
                borderLeftWidth: theme.borderWidth.hairline,
              },
            ]}
          >
            <Text
              style={[
                theme.typography.body.sm,
                {
                  color: theme.colors.text,
                  fontWeight: theme.typography.weights.medium,
                },
              ]}
            >
              View
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={handleEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${bill.name}`}
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: pressed
                ? theme.colors.text
                : theme.colors.accent,
            },
          ]}
        >
          <Text
            style={[
              theme.typography.body.sm,
              {
                color: theme.colors.bg,
                fontWeight: theme.typography.weights.medium,
              },
            ]}
          >
            Edit
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      // friction defaults to 1 (natural swipe). The actions container is
      // ~76px wide per button, so rightThreshold ~half of that feels right.
      rightThreshold={40}
      // The container paints the row's background so the swipe reveals
      // colored action buttons cleanly.
      containerStyle={{
        backgroundColor: theme.colors.surface,
      }}
    >
      <Pressable
        onPress={handleMainTap}
        onLongPress={handleEdit}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={
          isPaid
            ? `${bill.name}, ${formatCurrency(amount)}, paid. Tap to view payment details, swipe left for more actions.`
            : `${bill.name}, ${formatCurrency(amount)}. Tap to mark as paid, swipe left for more actions.`
        }
        style={({ pressed }) => [
          styles.row,
          {
            // The row background must stay fully opaque — applying `opacity`
            // to the whole row (instead of just the content) makes the
            // action buttons revealed by Swipeable bleed through during and
            // after the swipe. The dimming-for-paid effect lives on an
            // inner wrapper View instead.
            backgroundColor: pressed
              ? theme.colors.surfaceMuted
              : theme.colors.surface,
            borderColor: theme.colors.border,
            borderLeftWidth: accent ? 3 : 0,
            borderLeftColor: accent ?? 'transparent',
            paddingLeft: accent ? theme.spacing.md : theme.spacing.lg,
          },
        ]}
      >
        <View
          style={[
            styles.contentWrapper,
            {
              // Dim the *content* (text + sub-label + amount) for paid bills
              // — keeps the visual recede effect from the spreadsheet
              // metaphor without compromising the row background.
              opacity: isPaid ? theme.opacity.paid : 1,
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
                style={[
                  theme.typography.label.md,
                  { color: subColor, marginTop: 2 },
                ]}
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
        </View>
      </Pressable>
    </Swipeable>
  );
}

const ACTION_BUTTON_WIDTH = 76;

const styles = StyleSheet.create({
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingRight: 16,
    paddingVertical: 14,
  },
  contentWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: { flex: 1, marginRight: 12 },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  actionButton: {
    width: ACTION_BUTTON_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
});


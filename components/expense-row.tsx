// A single Expense row in the Spending tab list.
//
// Visual rules (PRD §"Core design principles" — Brand-color wallet identity):
//   - Small wallet brand-color dot to the left so the user can scan "where
//     did this come from?" at a glance.
//   - Description as primary text; category name as a small muted sub-label.
//     If the row also has a free-text note, append it after a middle-dot.
//   - Amount on the right. When `expense.amount` is null (placeholder
//     entries — see DATA_MODEL.md), render a muted em-dash instead of a
//     formatted amount.
//
// Tap target: tap → edit form at `/expenses/<id>`. No swipe actions in v1
// per the brief — Spending is the simpler list; the form has its own
// Delete button.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { Category } from '@/db/queries/categories';
import type { Expense } from '@/db/queries/expenses';
import type { Wallet } from '@/db/queries/wallets';
import { formatCurrency } from '@/logic/currency';
import { useTheme } from '@/state/theme';
import { accentColorFor } from '@/utils/wallet-color';

export interface ExpenseRowProps {
  expense: Expense;
  // Resolved via a parent-side lookup map. `undefined` only when the row
  // references a wallet/category that's been hard-deleted from underneath us
  // — the FK constraint normally prevents this. We render a graceful
  // fallback rather than crashing.
  wallet: Wallet | undefined;
  category: Category | undefined;
}

export function ExpenseRow({ expense, wallet, category }: ExpenseRowProps) {
  const router = useRouter();
  const theme = useTheme();
  const accent = accentColorFor(wallet) ?? theme.walletBrand.fallback;

  const hasAmount = expense.amount !== null && expense.amount !== undefined;
  const amountText = hasAmount
    ? formatCurrency(expense.amount as number)
    : '—';
  const amountColor = hasAmount ? theme.colors.text : theme.colors.textMuted;

  const categoryLabel = category?.name ?? 'Uncategorized';
  const subLabel = expense.note
    ? `${categoryLabel} · ${expense.note}`
    : categoryLabel;

  function handlePress() {
    router.push({
      pathname: '/expenses/[id]',
      params: { id: expense.id },
    });
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={
        hasAmount
          ? `${expense.description}, ${amountText}, ${categoryLabel}. Tap to edit.`
          : `${expense.description}, no amount, ${categoryLabel}. Tap to edit.`
      }
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
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <View style={styles.left}>
        <Text
          style={[theme.typography.body.md, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          {expense.description}
        </Text>
        <Text
          style={[
            theme.typography.label.md,
            { color: theme.colors.textMuted, marginTop: 2 },
          ]}
          numberOfLines={1}
        >
          {subLabel}
        </Text>
      </View>
      <Text
        style={[
          theme.typography.body.md,
          {
            color: amountColor,
            fontWeight: theme.typography.weights.medium,
          },
        ]}
      >
        {amountText}
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
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  left: { flex: 1, marginRight: 12 },
});

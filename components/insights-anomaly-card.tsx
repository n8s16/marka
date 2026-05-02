// Anomaly callouts on the Insights tab.
//
// Per docs/PRD.md §"Main tabs" — Insights:
//   "anomaly callouts ('Tech spending unusual this month')"
//
// Each row in the card describes one category whose current-period spending
// is significantly above its rolling average (per logic/aggregations.ts
// `getCategoryAnomalies`). The card itself is the most "huh, didn't expect
// that" callout in the app — when the anomaly list is empty, the parent
// screen MUST NOT render this card at all (showing a "no anomalies" empty
// state would be visual noise).
//
// Visual treatment:
//   - 3px left-accent border in `theme.colors.warning` to distinguish from
//     wallet-brand-accented cards. We deliberately reuse the warning color
//     (overdue / soft warnings) since "spending more than usual" reads as
//     a soft caution.
//   - Each row: category name primary, sub-label with the amount and ratio
//     ("Spent ₱X this month — 2.3× average over the last 3 months.").
//   - Hairline divider between rows when there are multiple anomalies.
//
// Pure presentational. The hook supplies the resolved category objects.

import { StyleSheet, Text, View } from 'react-native';

import type { Category } from '@/db/queries/categories';
import { formatCurrency } from '@/logic/currency';
import type { CategoryAnomaly } from '@/logic/aggregations';
import { useTheme } from '@/state/theme';

export interface InsightsAnomalyEntry {
  anomaly: CategoryAnomaly;
  /** Resolved by the parent from the categories lookup. */
  category: Category | undefined;
}

export interface InsightsAnomalyCardProps {
  /** Pre-sorted by ratio desc (the hook does this via `getCategoryAnomalies`). */
  entries: InsightsAnomalyEntry[];
  /** Lookback used to compute the rolling average; appears in the sub-label copy. */
  lookbackMonths: number;
}

export function InsightsAnomalyCard({
  entries,
  lookbackMonths,
}: InsightsAnomalyCardProps) {
  const theme = useTheme();

  // Defensive — the parent should not render this card with zero entries, but
  // if it does we stay silent rather than rendering an empty bordered card.
  if (entries.length === 0) return null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: theme.borderWidth.hairline,
          borderLeftWidth: 3,
          borderLeftColor: theme.colors.warning,
          borderRadius: theme.radii.md,
          marginHorizontal: theme.spacing.lg,
          marginBottom: theme.spacing.md,
        },
      ]}
    >
      <Text
        style={[
          theme.typography.label.md,
          {
            color: theme.colors.textFaint,
            textTransform: 'uppercase',
            paddingTop: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
          },
        ]}
      >
        Heads up
      </Text>
      <View style={{ paddingVertical: theme.spacing.xs }}>
        {entries.map((entry, idx) => {
          const isLast = idx === entries.length - 1;
          const name = entry.category?.name ?? 'Uncategorized';
          const ratioText = `${entry.anomaly.ratio.toFixed(1)}×`;
          const periodWord = lookbackMonths === 1 ? 'month' : 'months';
          return (
            <View
              key={entry.anomaly.categoryId}
              style={[
                styles.row,
                {
                  paddingHorizontal: theme.spacing.lg,
                  paddingVertical: theme.spacing.md,
                  borderBottomColor: theme.colors.border,
                  borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              <Text
                style={[
                  theme.typography.body.md,
                  {
                    color: theme.colors.text,
                    fontWeight: theme.typography.weights.medium,
                  },
                ]}
                numberOfLines={1}
              >
                {name}
              </Text>
              <Text
                style={[
                  theme.typography.label.md,
                  { color: theme.colors.textMuted, marginTop: 2 },
                ]}
              >
                Spent {formatCurrency(entry.anomaly.currentAmount)} this month
                {' — '}
                {ratioText} average over the last {lookbackMonths} {periodWord}.
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  row: {
    // Rows are full-width inside the card; the card itself has the left border.
  },
});

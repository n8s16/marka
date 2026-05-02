// Per-category spending card on the Insights tab.
//
// Categories don't carry brand colors (per docs/PRD.md — only wallets encode
// identity through color), so rows are minimal: name on the left, amount on
// the right. Zero-spending categories render with muted text so the eye
// drifts to the categories with activity.
//
// Empty state: when every category is zero (the user hasn't logged any
// expenses this month yet — bills paid don't show up here because bills
// aren't categorized) we render a small inline "no spending yet" notice
// inside the card area instead of an empty bordered list.

import { StyleSheet, Text, View } from 'react-native';

import type { Category } from '@/db/queries/categories';
import { formatCurrency } from '@/logic/currency';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

export interface InsightsByCategoryRow {
  category: Category;
  /** Centavos spent in the current month. */
  spending: number;
}

export interface InsightsByCategoryCardProps {
  rows: InsightsByCategoryRow[];
}

export function InsightsByCategoryCard({ rows }: InsightsByCategoryCardProps) {
  const theme = useTheme();

  const allZero = rows.length === 0 || rows.every((r) => r.spending === 0);

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
        By category
      </Text>
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
        {allZero ? (
          <View
            style={[
              styles.empty,
              {
                paddingHorizontal: theme.spacing.xxl,
                paddingVertical: theme.spacing.xl,
              },
            ]}
          >
            <Text
              style={[
                theme.typography.body.sm,
                { color: theme.colors.textMuted, textAlign: 'center' },
              ]}
            >
              No spending yet this month.
            </Text>
          </View>
        ) : (
          rows.map((row, idx) => (
            <CategoryRow
              key={row.category.id}
              theme={theme}
              row={row}
              isLast={idx === rows.length - 1}
            />
          ))
        )}
      </View>
    </View>
  );
}

interface CategoryRowProps {
  theme: Theme;
  row: InsightsByCategoryRow;
  isLast: boolean;
}

function CategoryRow({ theme, row, isLast }: CategoryRowProps) {
  const isZero = row.spending === 0;
  const textColor = isZero ? theme.colors.textMuted : theme.colors.text;
  return (
    <View
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
        style={[theme.typography.body.md, { color: textColor }]}
        numberOfLines={1}
      >
        {row.category.name}
      </Text>
      <Text
        style={[
          theme.typography.body.md,
          {
            color: textColor,
            fontWeight: theme.typography.weights.medium,
          },
        ]}
      >
        {formatCurrency(row.spending)}
      </Text>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

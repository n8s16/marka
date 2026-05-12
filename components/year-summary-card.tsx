// Top-of-screen card for the year view. Adapts copy by year context:
//
//   - Current year:  "Year so far" + total paid YTD + "X of Y bills · ₱Z upcoming"
//   - Past year:     "Total for 2025" + total paid + "X of Y bills · year complete"
//   - Future year:   "Forecast for 2027" + projected total (not reachable in v1.1
//                    but we render sanely if someone navigates there)

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatCurrency } from '@/logic/currency';
import type { YearSummary } from '@/logic/year-view';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

export interface YearSummaryCardProps {
  summary: YearSummary;
}

export function YearSummaryCard({ summary }: YearSummaryCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const heading = summary.isCurrent
    ? 'Year so far'
    : summary.isPast
      ? `Total for ${summary.year}`
      : `Forecast for ${summary.year}`;

  const billsLine = `${summary.paidCount} of ${summary.totalBillsDue} bills`;
  const tailLine = summary.isPast
    ? 'year complete'
    : summary.upcomingAmount > 0
      ? `${formatCurrency(summary.upcomingAmount)} upcoming`
      : null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Text
        style={[
          theme.typography.label.md,
          styles.heading,
          { color: theme.colors.textFaint },
        ]}
      >
        {heading}
      </Text>
      <Text
        style={[
          theme.typography.title.md,
          styles.amount,
          { color: theme.colors.text },
        ]}
      >
        {formatCurrency(summary.totalPaid)} paid
      </Text>
      <Text
        style={[
          theme.typography.label.sm,
          { color: theme.colors.textMuted },
        ]}
      >
        {tailLine ? `${billsLine} · ${tailLine}` : billsLine}
      </Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      marginHorizontal: theme.spacing.lg,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderWidth: theme.borderWidth.hairline,
      borderRadius: theme.radii.md,
    },
    heading: {
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: theme.spacing.xs,
    },
    amount: {
      marginBottom: theme.spacing.xs,
    },
  });
}

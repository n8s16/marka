// One row in the year-view month list.
//
// Renders in one of two visual states based on `expanded`:
//
//   collapsed — single-line row with month name, total paid, slim
//                wallet-color strip, and a "X of Y paid" subtitle.
//                Tappable; tapping fires `onToggle`.
//
//   expanded  — full card with month name, optional "this month" pill,
//                detailed per-day strip, and an inline compact bill
//                list (wallet dot + name + due date + amount, with
//                strikethrough on paid). The card header is tappable
//                to collapse.
//
// Future months in the current year render in `textMuted` so the
// visual hierarchy reads "current and past" first, "upcoming" second.
// Past months in any past year render in normal text — they're
// browse-able context.

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { format as formatDate, parseISO } from 'date-fns';

import type { Wallet } from '@/db/queries/wallets';
import { formatCurrency } from '@/logic/currency';
import type { MonthDayCell, MonthSummary } from '@/logic/year-view';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';
import { accentColorFor } from '@/utils/wallet-color';
import { MonthStrip } from './month-strip';

export interface MonthRowProps {
  summary: MonthSummary;
  walletsById: Map<string, Wallet>;
  expanded: boolean;
  /** Toggles the expansion state. Called on row / header tap. */
  onToggle: () => void;
}

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function MonthRow({ summary, walletsById, expanded, onToggle }: MonthRowProps) {
  if (expanded) {
    return <ExpandedMonthRow summary={summary} walletsById={walletsById} onToggle={onToggle} />;
  }
  return <CollapsedMonthRow summary={summary} walletsById={walletsById} onToggle={onToggle} />;
}

// ---------- Collapsed ----------

interface CollapsedMonthRowProps {
  summary: MonthSummary;
  walletsById: Map<string, Wallet>;
  onToggle: () => void;
}

function CollapsedMonthRow({ summary, walletsById, onToggle }: CollapsedMonthRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const monthLabel = MONTH_LABELS[summary.monthIndex];
  const textColor = summary.isFutureMonth ? theme.colors.textMuted : theme.colors.text;

  // Future months with no data render an empty placeholder row but keep
  // the strip area reserved so the visual rhythm stays consistent.
  const subtitle = summary.totalBillsDue === 0
    ? 'No bills tracked'
    : `${summary.paidCount} of ${summary.totalBillsDue} paid`;

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={`Expand ${monthLabel}`}
      style={({ pressed }) => [
        styles.collapsedRow,
        pressed && { backgroundColor: theme.colors.surfaceMuted },
      ]}
    >
      <View style={styles.collapsedHeader}>
        <Text
          style={[theme.typography.body.md, { color: textColor }]}
        >
          {monthLabel}
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
          {summary.totalPaid > 0 ? formatCurrency(summary.totalPaid) : '—'}
        </Text>
      </View>

      <View style={styles.collapsedStripWrap}>
        <MonthStrip
          cells={summary.cells}
          daysInMonth={summary.daysInMonth}
          walletsById={walletsById}
          density="slim"
        />
      </View>

      <Text
        style={[
          theme.typography.label.sm,
          { color: theme.colors.textFaint },
        ]}
      >
        {subtitle}
      </Text>
    </Pressable>
  );
}

// ---------- Expanded ----------

interface ExpandedMonthRowProps {
  summary: MonthSummary;
  walletsById: Map<string, Wallet>;
  onToggle: () => void;
}

function ExpandedMonthRow({ summary, walletsById, onToggle }: ExpandedMonthRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const monthLabel = MONTH_LABELS[summary.monthIndex];

  const remaining = summary.upcomingAmount;
  const subtitle = summary.totalBillsDue === 0
    ? 'No bills tracked'
    : summary.isCurrentMonth && remaining > 0
      ? `${summary.paidCount} of ${summary.totalBillsDue} paid · ${formatCurrency(remaining)} left`
      : `${summary.paidCount} of ${summary.totalBillsDue} paid`;

  return (
    <View
      style={[
        styles.expandedCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`Collapse ${monthLabel}`}
        style={({ pressed }) => [
          styles.expandedHeader,
          pressed && { opacity: theme.opacity.muted },
        ]}
      >
        <View style={styles.expandedTitleRow}>
          <Text
            style={[
              theme.typography.body.md,
              {
                color: theme.colors.text,
                fontWeight: theme.typography.weights.medium,
              },
            ]}
          >
            {monthLabel}
          </Text>
          {summary.isCurrentMonth ? (
            <View
              style={[
                styles.thisMonthPill,
                { backgroundColor: theme.colors.surfaceMuted },
              ]}
            >
              <Text style={[styles.thisMonthPillText, { color: theme.colors.textMuted }]}>
                this month
              </Text>
            </View>
          ) : null}
          <View style={styles.expandedTitleSpacer} />
          <Text
            style={[
              theme.typography.body.md,
              {
                color: theme.colors.text,
                fontWeight: theme.typography.weights.medium,
              },
            ]}
          >
            {summary.totalPaid > 0 ? formatCurrency(summary.totalPaid) : '—'}
          </Text>
        </View>
        <Text
          style={[
            theme.typography.label.sm,
            { color: theme.colors.textFaint },
          ]}
        >
          {subtitle}
        </Text>
      </Pressable>

      <View style={styles.expandedStripWrap}>
        <MonthStrip
          cells={summary.cells}
          daysInMonth={summary.daysInMonth}
          walletsById={walletsById}
          density="full"
        />
      </View>

      {summary.cells.length > 0 ? (
        <View style={styles.billList}>
          {summary.cells.map((cell, idx) => (
            <ExpandedBillItem
              key={`${cell.bill.id}-${idx}`}
              cell={cell}
              period={summary.period}
              walletsById={walletsById}
              isLast={idx === summary.cells.length - 1}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

interface ExpandedBillItemProps {
  cell: MonthDayCell;
  /** The YYYY-MM period this cell belongs to — used to render the date label. */
  period: string;
  walletsById: Map<string, Wallet>;
  isLast: boolean;
}

function ExpandedBillItem({ cell, period, walletsById, isLast }: ExpandedBillItemProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Resolve wallet + due-date display. For paid: use the payment's
  // wallet; for unpaid: use the bill's default wallet (where the user
  // is likely to pay from).
  const wallet =
    cell.status.kind === 'paid'
      ? walletsById.get(cell.status.payment.wallet_id)
      : walletsById.get(cell.bill.default_wallet_id);
  const walletColor = accentColorFor(wallet) ?? theme.walletBrand.fallback;
  const walletName = wallet?.name ?? '—';

  const dayLabel = formatDayLabel(period, cell.dueDay);

  const isPaid = cell.status.kind === 'paid';
  const isOverdue = cell.status.kind === 'overdue';
  // Inline the narrow so TS follows the discriminant through to the
  // payment access — the boolean alias above doesn't carry the type info.
  const amount =
    cell.status.kind === 'paid'
      ? cell.status.payment.amount
      : cell.bill.expected_amount;

  return (
    <View
      style={[
        styles.billItem,
        !isLast && {
          borderBottomWidth: theme.borderWidth.hairline,
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      <View style={[styles.walletDot, { backgroundColor: walletColor }]} />
      <View style={styles.billText}>
        <Text
          style={[
            theme.typography.body.sm,
            {
              color: theme.colors.text,
              textDecorationLine: isPaid ? 'line-through' : 'none',
              opacity: isPaid ? theme.opacity.paid : 1,
            },
          ]}
          numberOfLines={1}
        >
          {cell.bill.name}
        </Text>
        <Text
          style={[
            theme.typography.label.sm,
            { color: theme.colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {`${dayLabel} · ${walletName}`}
        </Text>
      </View>
      <Text
        style={[
          theme.typography.body.sm,
          {
            color: isOverdue ? theme.colors.warning : theme.colors.text,
            textDecorationLine: isPaid ? 'line-through' : 'none',
            opacity: isPaid ? theme.opacity.paid : 1,
            fontVariant: ['tabular-nums'],
          },
        ]}
      >
        {formatCurrency(amount)}
      </Text>
    </View>
  );
}

// "Apr 15" style label built from the row's period + the cell's dueDay.
function formatDayLabel(period: string, dueDay: number): string {
  const date = parseISO(`${period}-${String(dueDay).padStart(2, '0')}`);
  if (Number.isNaN(date.getTime())) return `Day ${dueDay}`;
  return formatDate(date, 'MMM d');
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    // Collapsed row
    collapsedRow: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
    },
    collapsedHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: theme.spacing.xs,
    },
    collapsedStripWrap: {
      marginVertical: theme.spacing.xs,
    },

    // Expanded card
    expandedCard: {
      marginHorizontal: theme.spacing.lg,
      marginVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.sm,
      borderWidth: theme.borderWidth.hairline,
      borderRadius: theme.radii.md,
    },
    expandedHeader: {
      paddingBottom: theme.spacing.sm,
    },
    expandedTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.xs,
    },
    expandedTitleSpacer: {
      flex: 1,
    },
    thisMonthPill: {
      // Tighter than label.sm — spec calls for 8px font and a small
      // rounded badge. We compromise at 9 for legibility on dense
      // displays without crossing into "unreadable" territory.
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
    },
    thisMonthPillText: {
      fontSize: 9,
      fontWeight: theme.typography.weights.medium,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    expandedStripWrap: {
      marginTop: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    billList: {
      paddingTop: theme.spacing.xs,
    },
    billItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    walletDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    billText: {
      flex: 1,
    },
  });
}

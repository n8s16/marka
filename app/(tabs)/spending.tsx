// Spending tab — chronological log of one-off expenses with quick-add.
//
// Per docs/PRD.md §"Main tabs" — Spending:
//   - Monthly total summary card at top.
//   - Chronological log of expenses, grouped by date.
//   - Floating + button (bottom-right) routes to /expenses/new.
//
// Layout mirrors the Bills tab: SafeAreaView root, header with the tab
// title, ScrollView with stickyHeaderIndices=[0] so the summary card pins
// while the list scrolls beneath. Wallets-tab pattern for the FAB lives on
// Bills; we reuse the same idiom here.
//
// Data fetching and derivation live in `state/expenses-current-month.ts` —
// this file is layout-only.

import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  format as formatDate,
  isSameDay,
  parseISO,
  subDays,
} from 'date-fns';

import { ExpenseRow } from '@/components/expense-row';
import { SpendingSummaryCard } from '@/components/spending-summary-card';
import { useDb } from '@/db/client';
import type { Expense } from '@/db/queries/expenses';
import { useExpensesCurrentMonth } from '@/state/expenses-current-month';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

interface DateGroup {
  /** YYYY-MM-DD — used as a stable key. */
  date: string;
  /** Pre-formatted heading: "Today", "Yesterday", or "EEE, MMM d". */
  label: string;
  expenses: Expense[];
}

/**
 * Group an already-sorted (date desc, created_at desc) expense list by date.
 * The order of groups follows the input order; within each group, items
 * preserve their incoming sort.
 */
function groupExpensesByDate(expenses: Expense[], today: Date): DateGroup[] {
  const yesterday = subDays(today, 1);
  const groups: DateGroup[] = [];
  let current: DateGroup | null = null;

  for (const e of expenses) {
    if (!current || current.date !== e.date) {
      const parsed = parseISO(e.date);
      let label: string;
      if (!Number.isNaN(parsed.getTime()) && isSameDay(parsed, today)) {
        label = 'Today';
      } else if (
        !Number.isNaN(parsed.getTime()) &&
        isSameDay(parsed, yesterday)
      ) {
        label = 'Yesterday';
      } else if (Number.isNaN(parsed.getTime())) {
        // Defensive: malformed dates should never reach this path because
        // the schema is YYYY-MM-DD, but if one does, fall back to the raw
        // string rather than rendering "Invalid Date".
        label = e.date;
      } else {
        label = formatDate(parsed, 'EEE, MMM d');
      }
      current = { date: e.date, label, expenses: [] };
      groups.push(current);
    }
    current.expenses.push(e);
  }

  return groups;
}

export default function SpendingScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const router = useRouter();

  // Today is captured once per mount so all derived values agree across the
  // hook's memoized outputs and any locally-formatted strings.
  const today = useMemo(() => new Date(), []);
  const currentMonthLabel = useMemo(
    () => formatDate(today, 'MMMM yyyy'),
    [today],
  );

  const {
    loading,
    error,
    expenses,
    walletsById,
    categoriesById,
    monthlyTotal,
  } = useExpensesCurrentMonth(db, today);

  const groups = useMemo(
    () => groupExpensesByDate(expenses, today),
    [expenses, today],
  );

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text
            style={[theme.typography.title.md, { color: theme.colors.text }]}
          >
            Spending
          </Text>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.text} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text
              style={[
                theme.typography.body.sm,
                { color: theme.colors.danger },
              ]}
            >
              Failed to load expenses: {error.message}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            // Sticky the summary card so the monthly total stays visible
            // while the list scrolls underneath. The wrapper View paints
            // the page background so the card's horizontal gutters stay
            // opaque when content scrolls beneath them.
            stickyHeaderIndices={[0]}
          >
            <View style={styles.stickyHeader}>
              <SpendingSummaryCard
                monthLabel={currentMonthLabel}
                total={monthlyTotal}
              />
            </View>

            {expenses.length === 0 ? (
              <View style={styles.empty}>
                <Text
                  style={[
                    theme.typography.body.md,
                    {
                      color: theme.colors.textMuted,
                      textAlign: 'center',
                    },
                  ]}
                >
                  No expenses yet. Tap + to log your first expense.
                </Text>
              </View>
            ) : (
              groups.map((group) => (
                <View key={group.date} style={styles.group}>
                  <Text
                    style={[
                      theme.typography.label.md,
                      styles.groupHeader,
                      { color: theme.colors.textFaint },
                    ]}
                  >
                    {group.label}
                  </Text>
                  <View style={styles.list}>
                    {group.expenses.map((e) => (
                      <ExpenseRow
                        key={e.id}
                        expense={e}
                        wallet={walletsById.get(e.wallet_id)}
                        category={categoriesById.get(e.category_id)}
                      />
                    ))}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* Floating + button — primary entry point for adding an expense.
            Mirrors the Bills tab FAB. */}
        <Pressable
          onPress={() => router.push('/expenses/new')}
          accessibilityRole="button"
          accessibilityLabel="Add expense"
          hitSlop={8}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: theme.colors.accent,
              opacity: pressed ? theme.opacity.muted : 1,
            },
          ]}
        >
          <Ionicons name="add" size={28} color={theme.colors.bg} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.bg },
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.md,
    },
    scrollContent: { paddingBottom: theme.spacing.xxxl },
    stickyHeader: {
      backgroundColor: theme.colors.bg,
      paddingTop: theme.spacing.xs,
      paddingBottom: theme.spacing.xs,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.xxl,
      paddingVertical: theme.spacing.xxxl,
    },
    group: {
      marginBottom: theme.spacing.md,
    },
    groupHeader: {
      textTransform: 'uppercase',
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.xs,
    },
    list: {
      marginHorizontal: theme.spacing.lg,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      borderColor: theme.colors.border,
      borderWidth: theme.borderWidth.hairline,
      overflow: 'hidden',
    },
    fab: {
      position: 'absolute',
      right: theme.spacing.xxl,
      bottom: theme.spacing.xxl,
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 4,
    },
  });
}

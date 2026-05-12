// Bills tab — current month at a glance.
//
// Per docs/PRD.md §"Main tabs":
//   - Summary card: paid / total expected for the current month.
//   - Upcoming reminder callout: surfaces the soonest active reminder.
//   - List of bills with paid items struck through, wallet color tint.
//   - Floating + button (bottom-right) routes to /bills/new (add).
//   - "Year view" link top-right routes to /year-grid.
//
// Data fetching and derivation live in `state/bills-current-month.ts` —
// this file is layout-only.

import { useMemo, useState } from 'react';
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
import { format as formatDate } from 'date-fns';

import { BillRow } from '@/components/bill-row';
import { BillsEmptyState } from '@/components/bills-empty-state';
import { BillsReminderCallout } from '@/components/bills-reminder-callout';
import { BillsSummaryCard } from '@/components/bills-summary-card';
import { TextField } from '@/components/text-field';
import { useDb } from '@/db/client';
import { useBillsCurrentMonth } from '@/state/bills-current-month';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

export default function BillsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const router = useRouter();

  // Today is captured once per mount so all derived values agree across the
  // hook's memoized outputs and any locally-formatted strings.
  const today = useMemo(() => new Date(), []);
  const currentMonthLabel = useMemo(() => formatDate(today, 'MMMM yyyy'), [today]);

  const {
    loading,
    error,
    entries,
    paidTotal,
    expectedTotal,
    reminderEntry,
  } = useBillsCurrentMonth(db, today);

  // Free-text search over bill names. Stays in screen state — not in
  // the data hook — so the summary card and reminder callout keep
  // reflecting the actual month total, not a filtered total. Most
  // users will want "₱X paid of ₱Y this month" visible while they
  // hunt for a specific bill.
  const [searchQuery, setSearchQuery] = useState('');
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.bill.name.toLowerCase().includes(q));
  }, [entries, searchQuery]);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[theme.typography.title.md, { color: theme.colors.text }]}>
            Bills
          </Text>
          <Pressable
            onPress={() => router.push('/year-grid')}
            hitSlop={8}
          >
            <Text
              style={[
                theme.typography.body.sm,
                {
                  color: theme.colors.accent,
                  fontWeight: theme.typography.weights.medium,
                },
              ]}
            >
              Year view
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.text} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text
              style={[theme.typography.body.sm, { color: theme.colors.danger }]}
            >
              Failed to load bills: {error.message}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            // Sticky the summary card so the paid/expected totals stay
            // visible while the bills list scrolls underneath. The wrapper
            // View paints the page background so the card's horizontal
            // gutters stay opaque when content scrolls beneath them.
            stickyHeaderIndices={[0]}
          >
            <View style={styles.stickyHeader}>
              <BillsSummaryCard
                monthLabel={currentMonthLabel}
                paid={paidTotal}
                expected={expectedTotal}
              />
            </View>

            {reminderEntry && reminderEntry.status.kind === 'upcoming' ? (
              <BillsReminderCallout
                bill={reminderEntry.bill}
                daysUntilDue={reminderEntry.status.daysUntilDue}
                amount={reminderEntry.amount}
                walletName={reminderEntry.paidWallet?.name}
              />
            ) : null}

            {/* Search field — only rendered once there are bills to
                filter. On a fresh install the empty state is its own
                affordance ("Tap + to add your first bill"); a search
                input there would be noise. */}
            {entries.length > 0 ? (
              <View style={styles.searchWrap}>
                <TextField
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search bills"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                  accessibilityLabel="Search bills by name"
                />
              </View>
            ) : null}

            {entries.length === 0 ? (
              <BillsEmptyState />
            ) : filteredEntries.length === 0 ? (
              <View style={styles.noMatches}>
                <Text
                  style={[
                    theme.typography.body.md,
                    { color: theme.colors.textMuted, textAlign: 'center' },
                  ]}
                >
                  No bills match &ldquo;{searchQuery.trim()}&rdquo;.
                </Text>
              </View>
            ) : (
              <View style={styles.list}>
                {filteredEntries.map((e) => (
                  <BillRow
                    key={e.bill.id}
                    bill={e.bill}
                    period={e.period}
                    status={e.status}
                    amount={e.amount}
                    paidWallet={e.paidWallet}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        )}

        {/* Floating + button — primary entry point for adding a bill. The
            absolute-positioned wrapper sits inside the SafeAreaView's flex
            container so it overlays the ScrollView without disturbing layout. */}
        <Pressable
          onPress={() => router.push('/bills/new')}
          accessibilityRole="button"
          accessibilityLabel="Add bill"
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
    // `flexGrow: 1` lets the empty-state View inside expand to fill
    // the remaining vertical space (otherwise the empty state collapses
    // to its natural height and leaves dead space below).
    scrollContent: { flexGrow: 1, paddingBottom: theme.spacing.xxxl },
    stickyHeader: {
      backgroundColor: theme.colors.bg,
      paddingTop: theme.spacing.xs,
      paddingBottom: theme.spacing.xs,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: {
      marginHorizontal: theme.spacing.lg,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      borderColor: theme.colors.border,
      borderWidth: theme.borderWidth.hairline,
      overflow: 'hidden',
    },
    searchWrap: {
      marginHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing.md,
    },
    noMatches: {
      paddingHorizontal: theme.spacing.xxl,
      paddingVertical: theme.spacing.xxxl,
      alignItems: 'center',
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
      // Shadow / elevation so the button reads as floating above content.
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 4,
    },
  });
}

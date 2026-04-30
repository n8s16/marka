// Bills tab — current month at a glance.
//
// Per docs/PRD.md §"Main tabs":
//   - Summary card: paid / total expected for the current month.
//   - Upcoming reminder callout: surfaces the soonest active reminder.
//   - List of bills with paid items struck through, wallet color tint.
//   - Floating + button (bottom-right) routes to /bills/new (add).
//   - "Year view" link top-right (stub here; wired in build step 7).
//
// Data fetching and derivation live in `state/bills-current-month.ts` —
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { format as formatDate } from 'date-fns';

import { BillRow } from '@/components/bill-row';
import { BillsEmptyState } from '@/components/bills-empty-state';
import { BillsReminderCallout } from '@/components/bills-reminder-callout';
import { BillsSummaryCard } from '@/components/bills-summary-card';
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

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[theme.typography.title.md, { color: theme.colors.text }]}>
            Bills
          </Text>
          <Pressable
            onPress={() => {
              // TODO: wire to year grid in step 7
              console.log('Year view tapped — wire in step 7.');
            }}
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
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <BillsSummaryCard
              monthLabel={currentMonthLabel}
              paid={paidTotal}
              expected={expectedTotal}
            />

            {reminderEntry && reminderEntry.status.kind === 'upcoming' ? (
              <BillsReminderCallout
                bill={reminderEntry.bill}
                daysUntilDue={reminderEntry.status.daysUntilDue}
                amount={reminderEntry.amount}
                walletName={reminderEntry.paidWallet?.name}
              />
            ) : null}

            {entries.length === 0 ? (
              <BillsEmptyState />
            ) : (
              <View style={styles.list}>
                {entries.map((e) => (
                  <BillRow
                    key={e.bill.id}
                    bill={e.bill}
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
          <Text style={[styles.fabIcon, { color: theme.colors.bg }]}>+</Text>
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
      // Shadow / elevation so the button reads as floating above content.
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 4,
    },
    fabIcon: {
      fontSize: 28,
      lineHeight: 32,
      fontWeight: '500',
    },
  });
}

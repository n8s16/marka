// Wallets tab — outflow-primary view, per-wallet outflow cards.
//
// Per docs/PRD.md §"Main tabs" — Wallets:
//   - "Out this month" summary card with bills/spending split (transfers
//     intentionally excluded — see DATA_MODEL.md §"Critical rule").
//   - Per-wallet outflow cards. Wallets with zero outflow still render but
//     are visually greyed via `wallet-outflow-card.tsx`.
//   - "Record a transfer" + "View transfers" affordances at the bottom.
//     Record routes to /transfers/new (step 6); View routes to /transfers
//     for the all-time history list (DECISIONS §26 — transfer history
//     lives on its own screen, reachable from here).
//
// Layout mirrors the Bills tab: SafeAreaView root, header with title only
// (no top-right link), ScrollView with stickyHeaderIndices=[0] so the
// summary card pins to the top while the wallet list scrolls beneath.
//
// Data fetching and derivation live in `state/wallets-current-month.ts` —
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

import { WalletOutflowCard } from '@/components/wallet-outflow-card';
import { WalletsSummaryCard } from '@/components/wallets-summary-card';
import { useDb } from '@/db/client';
import { useWalletsCurrentMonth } from '@/state/wallets-current-month';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

export default function WalletsScreen() {
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

  const { loading, error, walletsWithOutflow, totalBreakdown } =
    useWalletsCurrentMonth(db, today);

  function handleRecordTransfer() {
    router.push('/transfers/new');
  }

  function handleViewTransfers() {
    router.push('/transfers');
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[theme.typography.title.md, { color: theme.colors.text }]}>
            Wallets
          </Text>
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
              Failed to load wallets: {error.message}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            // Sticky the summary card so the "out this month" totals stay
            // visible while the wallet list scrolls underneath. The wrapper
            // View paints the page background so the card's horizontal
            // gutters stay opaque when content scrolls beneath them.
            stickyHeaderIndices={[0]}
          >
            <View style={styles.stickyHeader}>
              <WalletsSummaryCard
                monthLabel={currentMonthLabel}
                bills={totalBreakdown.bills}
                spending={totalBreakdown.spending}
                total={totalBreakdown.total}
              />
            </View>

            {walletsWithOutflow.length === 0 ? (
              <View style={styles.empty}>
                <Text
                  style={[
                    theme.typography.body.md,
                    { color: theme.colors.textMuted, textAlign: 'center' },
                  ]}
                >
                  No wallets — add one in Settings later.
                </Text>
              </View>
            ) : (
              <View style={styles.list}>
                {walletsWithOutflow.map((entry) => (
                  <WalletOutflowCard
                    key={entry.wallet.id}
                    wallet={entry.wallet}
                    outflow={entry.outflow}
                  />
                ))}
              </View>
            )}

            <View style={styles.transferActions}>
              <Pressable
                onPress={handleRecordTransfer}
                accessibilityRole="button"
                accessibilityLabel="Record a transfer"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.transferButton,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: pressed
                      ? theme.colors.surfaceMuted
                      : theme.colors.surface,
                  },
                ]}
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
                  Record a transfer
                </Text>
              </Pressable>

              <Pressable
                onPress={handleViewTransfers}
                accessibilityRole="button"
                accessibilityLabel="View transfer history"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.transferButton,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: pressed
                      ? theme.colors.surfaceMuted
                      : theme.colors.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    theme.typography.body.sm,
                    {
                      color: theme.colors.text,
                      fontWeight: theme.typography.weights.regular,
                    },
                  ]}
                >
                  View transfers
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
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
    list: {
      marginHorizontal: theme.spacing.lg,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      borderColor: theme.colors.border,
      borderWidth: theme.borderWidth.hairline,
      overflow: 'hidden',
    },
    empty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.xxl,
      paddingVertical: theme.spacing.xxxl,
    },
    transferActions: {
      marginTop: theme.spacing.lg,
      marginHorizontal: theme.spacing.lg,
      gap: theme.spacing.sm,
    },
    transferButton: {
      borderRadius: theme.radii.md,
      borderWidth: theme.borderWidth.hairline,
      paddingVertical: theme.spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

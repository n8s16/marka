// Wallets tab — outflow-primary view, per-wallet outflow cards.
//
// Per docs/PRD.md §"Main tabs" — Wallets:
//   - "Out this month" summary card with bills/spending split (transfers
//     intentionally excluded — see DATA_MODEL.md §"Critical rule").
//   - Per-wallet outflow cards. Wallets with zero outflow still render but
//     are visually greyed via `wallet-outflow-card.tsx`.
//   - "Transfers · Settings" links at the top-right of the header — open
//     the transfers history screen at /transfers (DECISIONS §26) and the
//     Settings hub at /settings respectively. Two small accent-colored
//     text links separated by a middle dot. The links are siblings inside
//     a flex row on the right side of the header so the existing
//     space-between layout keeps the title left-anchored.
//   - Floating + button at bottom-right — records a new transfer at
//     /transfers/new. Same FAB idiom as Bills (+ → /bills/new) and
//     Spending (+ → /expenses/new) for visual consistency across tabs.
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

  function handleOpenSettings() {
    router.push('/settings');
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[theme.typography.title.md, { color: theme.colors.text }]}>
            Wallets
          </Text>
          {/* Right-side header links. Sub-row keeps Transfers and Settings
              as siblings so the parent flex header stays a clean two-column
              (title | links) layout. Middle dot is a static separator
              (textFaint) between the two action links. */}
          <View style={styles.headerLinks}>
            <Pressable
              onPress={handleViewTransfers}
              accessibilityRole="button"
              accessibilityLabel="View transfer history"
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
                Transfers
              </Text>
            </Pressable>
            <Text
              style={[
                theme.typography.body.sm,
                { color: theme.colors.textFaint },
              ]}
            >
              {' · '}
            </Text>
            <Pressable
              onPress={handleOpenSettings}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
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
                Settings
              </Text>
            </Pressable>
          </View>
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

          </ScrollView>
        )}

        {/* Floating + button — records a new transfer. Mirrors the FAB
            pattern from Bills (→ /bills/new) and Spending (→ /expenses/new)
            for cross-tab visual consistency. */}
        <Pressable
          onPress={handleRecordTransfer}
          accessibilityRole="button"
          accessibilityLabel="Record a transfer"
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
    headerLinks: {
      flexDirection: 'row',
      alignItems: 'center',
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
    fabIcon: {
      fontSize: 28,
      lineHeight: 32,
      fontWeight: '500',
    },
  });
}

// Insights tab — totals, splits, anomalies, 6-month trend.
//
// Per docs/PRD.md §"Main tabs" — Insights:
//   "total spent · bills/spending split · by-wallet breakdown · anomaly
//    callouts ('Tech spending unusual this month') · 6-month trend chart."
//
// Layout mirrors the Spending tab: SafeAreaView root, header with the tab
// title (no top-right link, no FAB — Insights is read-only), ScrollView
// with stickyHeaderIndices=[0] so the summary card pins while the rest
// scrolls beneath.
//
// Section order below the sticky header:
//   1. 6-month trend chart
//   2. Anomalies (only when there are any)
//   3. By wallet
//   4. By category
//
// Falls back to the empty-state component when there's no activity in the
// current month AND no historical activity in the 6-month window.
//
// Data fetching and derivation live in `state/insights-current-month.ts` —
// this file is layout-only.

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format as formatDate } from 'date-fns';

import { InsightsAnomalyCard } from '@/components/insights-anomaly-card';
import { InsightsByCategoryCard } from '@/components/insights-by-category-card';
import { InsightsByWalletCard } from '@/components/insights-by-wallet-card';
import { InsightsEmptyState } from '@/components/insights-empty-state';
import { InsightsSummaryCard } from '@/components/insights-summary-card';
import { InsightsTrendChart } from '@/components/insights-trend-chart';
import { SegmentedChips } from '@/components/segmented-chips';
import { useDb } from '@/db/client';
import { useInsightsCurrentMonth } from '@/state/insights-current-month';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

// Trend window options for the picker above the chart. Default 6 keeps
// parity with the PRD's original "6-month trend chart" framing; longer
// windows are user-driven for "how does this Q1 compare to last Q1?"
// kinds of questions. Values are strings so SegmentedChips's generic
// constraint (T extends string) is happy; we parse to int at the hook
// boundary.
type WindowChoice = '3' | '6' | '12' | '24';
const WINDOW_OPTIONS: ReadonlyArray<{ value: WindowChoice; label: string }> = [
  { value: '3', label: '3M' },
  { value: '6', label: '6M' },
  { value: '12', label: '12M' },
  { value: '24', label: '24M' },
];

// Anomaly lookback the hook uses internally — restated here so the card's
// sub-label copy ("over the last N months") stays in sync without crossing
// hook/component boundaries with another prop.
const ANOMALY_LOOKBACK_MONTHS = 3;

export default function InsightsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();

  // Today is captured once per mount so all derived values agree across the
  // hook's memoized outputs and any locally-formatted strings.
  const today = useMemo(() => new Date(), []);
  const currentMonthLabel = useMemo(
    () => formatDate(today, 'MMMM yyyy'),
    [today],
  );

  // Trend window picker — transient (resets to 6 on app launch). The
  // user picks via the chips above the chart; the hook re-fetches when
  // the window changes.
  const [windowChoice, setWindowChoice] = useState<WindowChoice>('6');
  const windowMonths = parseInt(windowChoice, 10);

  const {
    loading,
    error,
    total,
    bills,
    spending,
    walletsByOutflow,
    categoriesByOutflow,
    trend,
    trendByWallet,
    anomalies,
  } = useInsightsCurrentMonth(db, today, windowMonths);

  // Wallet list for the chart's stacked bars — uses the by-wallet rows
  // (active wallets only). The chart accepts archived-only walletIds in
  // the data via a fallback color, so missing them here is fine.
  const chartWallets = useMemo(
    () => walletsByOutflow.map((r) => r.wallet),
    [walletsByOutflow],
  );

  // Decide whether to render the cards stack or the empty state. The cards
  // hide entirely when there's no current-month activity AND the 6-month
  // trend is uniformly zero (no historical data either). Either having
  // any current-month total or any non-zero historical month is enough to
  // show the stack — we want the user to see their context, not a blank
  // screen, the moment they've logged anything.
  const hasAnyHistory = useMemo(() => trend.some((p) => p.total > 0), [trend]);
  const showCards = total > 0 || hasAnyHistory;

  // Resolve anomaly category objects from the categoriesByOutflow list. The
  // hook already returned categories in display order; we look up by id.
  const anomalyEntries = useMemo(() => {
    if (anomalies.length === 0) return [];
    const byId = new Map(categoriesByOutflow.map((r) => [r.category.id, r.category]));
    return anomalies.map((a) => ({
      anomaly: a,
      category: byId.get(a.categoryId),
    }));
  }, [anomalies, categoriesByOutflow]);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text
            style={[theme.typography.title.md, { color: theme.colors.text }]}
          >
            Insights
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
              Failed to load insights: {error.message}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            // Sticky the summary card so the headline total stays visible
            // while the cards scroll underneath. Same idiom as Bills /
            // Spending / Wallets.
            stickyHeaderIndices={[0]}
          >
            <View style={styles.stickyHeader}>
              <InsightsSummaryCard
                monthLabel={currentMonthLabel}
                bills={bills}
                spending={spending}
                total={total}
              />
            </View>

            {!showCards ? (
              <InsightsEmptyState />
            ) : (
              <>
                <View style={styles.windowPickerRow}>
                  <SegmentedChips
                    label="Trend window"
                    options={WINDOW_OPTIONS}
                    value={windowChoice}
                    onChange={setWindowChoice}
                  />
                </View>
                <InsightsTrendChart
                  data={trendByWallet}
                  wallets={chartWallets}
                />
                {anomalies.length > 0 ? (
                  <InsightsAnomalyCard
                    entries={anomalyEntries}
                    lookbackMonths={ANOMALY_LOOKBACK_MONTHS}
                  />
                ) : null}
                <InsightsByWalletCard
                  rows={walletsByOutflow.map((w) => ({
                    wallet: w.wallet,
                    breakdown: w.breakdown,
                  }))}
                />
                <InsightsByCategoryCard rows={categoriesByOutflow} />
              </>
            )}
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
    scrollContent: { flexGrow: 1, paddingBottom: theme.spacing.xxxl },
    stickyHeader: {
      backgroundColor: theme.colors.bg,
      paddingTop: theme.spacing.xs,
      paddingBottom: theme.spacing.xs,
    },
    windowPickerRow: {
      marginHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing.sm,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });
}

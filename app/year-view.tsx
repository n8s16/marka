// Year view v2 — vertical month list with per-month expansion.
//
// Per docs/year-view-redesign.md, this screen replaces the v1
// horizontal-scroll grid. Three render states share this file:
//
//   1. Current year (default): YearSwitcher → YearSummaryCard →
//      list of 12 months, January→December, with the current month
//      auto-expanded as the "you are here" anchor.
//   2. Past year: same shell, no month auto-expanded. The user taps
//      to expand whichever month interests them.
//   3. Expanded past month (any year): the tapped row swaps to the
//      expanded-card treatment in place; the rest of the list flows
//      around it.
//
// Navigation + expansion state lives in `useYearViewStore`. Data
// loading lives in `useYearViewData(db, year, today)`. The current-
// month auto-expansion is a side effect of mounting / year-switching
// (see the `useEffect` block below).

import { useEffect, useMemo } from 'react';
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

import { MonthRow } from '@/components/month-row';
import { YearSummaryCard } from '@/components/year-summary-card';
import { YearSwitcher } from '@/components/year-switcher';
import { useDb } from '@/db/client';
import { useTheme } from '@/state/theme';
import { useYearViewData, useYearViewStore } from '@/state/year-view';
import type { Theme } from '@/styles/theme';

export default function YearViewScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const router = useRouter();

  // Today is captured once per mount so the per-month derivations
  // (isCurrentMonth, overdue, etc.) all agree. A long-running session
  // crossing midnight is rare enough not to worry about here.
  const today = useMemo(() => new Date(), []);
  const todayYear = today.getFullYear();
  const todayPeriod = `${todayYear}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const displayedYear = useYearViewStore((s) => s.displayedYear);
  const expandedMonths = useYearViewStore((s) => s.expandedMonths);
  const setDisplayedYear = useYearViewStore((s) => s.setDisplayedYear);
  const setExpandedMonths = useYearViewStore((s) => s.setExpandedMonths);
  const toggleMonth = useYearViewStore((s) => s.toggleMonth);

  const {
    loading,
    error,
    monthSummaries,
    yearSummary,
    walletsById,
    earliestYearWithData,
  } = useYearViewData(db, displayedYear, today);

  // On first mount, default the displayed year to today's calendar
  // year and expand the current month. We re-run if `displayedYear`
  // changes (year switcher click): current year → expand current
  // month; other years → no expansion.
  useEffect(() => {
    if (displayedYear === todayYear) {
      setExpandedMonths([todayPeriod]);
    } else {
      setExpandedMonths([]);
    }
  }, [displayedYear, todayYear, todayPeriod, setExpandedMonths]);

  // Year-switcher boundaries: fade `‹` if we have no data before
  // displayedYear, fade `›` once we've reached the current year (no
  // future-year navigation in v1.1).
  const canGoBack =
    earliestYearWithData !== null && displayedYear > earliestYearWithData;
  const canGoForward = displayedYear < todayYear;

  function handlePrev() {
    setDisplayedYear(displayedYear - 1);
  }

  function handleNext() {
    setDisplayedYear(displayedYear + 1);
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to Bills"
            hitSlop={8}
          >
            <Text
              style={[
                theme.typography.body.sm,
                { color: theme.colors.accent },
              ]}
            >
              Back
            </Text>
          </Pressable>
          <Text
            style={[theme.typography.title.sm, { color: theme.colors.text }]}
          >
            Year view
          </Text>
          {/* Spacer keeps the title centred opposite the Back link. */}
          <View style={styles.headerSpacer} />
        </View>

        <YearSwitcher
          year={displayedYear}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onPrev={handlePrev}
          onNext={handleNext}
        />

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
              Failed to load year view: {error.message}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <YearSummaryCard summary={yearSummary} />

            <View style={styles.monthList}>
              {monthSummaries.map((summary) => (
                <MonthRow
                  key={summary.period}
                  summary={summary}
                  walletsById={walletsById}
                  expanded={expandedMonths.has(summary.period)}
                  onToggle={() => toggleMonth(summary.period)}
                />
              ))}
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
    headerSpacer: { width: 36 },
    scrollContent: {
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.xxxl,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    monthList: {
      marginTop: theme.spacing.md,
    },
  });
}

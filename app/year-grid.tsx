// Year grid screen — the spreadsheet-style `bills × months` matrix.
//
// Per docs/PRD.md §"Supporting screens" — Year grid:
//   - Horizontally scrollable rows × months matrix.
//   - Cells tinted by wallet color when paid, dashed border for forecasts,
//     em-dash for non-due months.
//
// Layout strategy: a vertical ScrollView with a sticky header row that
// pins the month labels at the top. Inside the sticky header AND inside
// the body, the cell columns live in horizontal ScrollViews that are
// synchronized via Reanimated worklets — when the user pans horizontally
// in either, the other follows on the UI thread without crossing the JS
// bridge. This avoids the Android sync race that plagues onScroll +
// scrollTo done in JS.
//
// Vertical scroll moves the bill-name column AND the cell rows together
// (they're both inside the body row of the ScrollView). The bill-name
// column doesn't horizontally scroll, so it reads as visually pinned to
// the left while cells slide past.
//
// Data fetching lives in `state/year-grid.ts`. Cell resolution lives in
// `logic/year-grid.ts` and is called per-cell during render.

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
import Animated, {
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';

import { CELL_HEIGHT, CELL_WIDTH, YearGridCell } from '@/components/year-grid-cell';
import { useDb } from '@/db/client';
import type { BillPayment } from '@/db/queries/bill-payments';
import { getYearGridCell } from '@/logic/year-grid';
import { useTheme } from '@/state/theme';
import { useYearGrid } from '@/state/year-grid';
import type { Theme } from '@/styles/theme';
import { accentColorFor } from '@/utils/wallet-color';

const NAME_COL_WIDTH = 140;

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function buildPeriods(year: number): string[] {
  const out: string[] = [];
  for (let m = 1; m <= 12; m++) {
    out.push(`${year}-${m.toString().padStart(2, '0')}`);
  }
  return out;
}

export default function YearGridScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const router = useRouter();

  // Year defaults to the current calendar year. Year picker (prev/next) is
  // a polish item per the brief — out of scope for this build.
  const year = useMemo(() => new Date().getFullYear(), []);
  const periods = useMemo(() => buildPeriods(year), [year]);

  const {
    loading,
    error,
    bills,
    walletsById,
    paymentsByBillByPeriod,
    recentPaymentsByBill,
  } = useYearGrid(db, year);

  // Refs + worklet handlers for the two horizontal scrolls (header row +
  // cell-rows body). Each handler scrolls the OTHER list to mirror its X
  // offset. Done as worklets so the sync runs on the UI thread — no JS
  // bridge round-trip, no visible lag.
  const headerScrollRef = useAnimatedRef<Animated.ScrollView>();
  const bodyScrollRef = useAnimatedRef<Animated.ScrollView>();

  const headerScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollTo(bodyScrollRef, e.contentOffset.x, 0, false);
    },
  });

  const bodyScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollTo(headerScrollRef, e.contentOffset.x, 0, false);
    },
  });

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
            style={[theme.typography.title.md, { color: theme.colors.text }]}
          >
            Year view
          </Text>
          <Text
            style={[
              theme.typography.body.sm,
              { color: theme.colors.textMuted },
            ]}
          >
            {year}
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
              Failed to load year grid: {error.message}
            </Text>
          </View>
        ) : bills.length === 0 ? (
          <View style={styles.empty}>
            <Text
              style={[
                theme.typography.body.md,
                {
                  color: theme.colors.textMuted,
                  textAlign: 'center',
                  marginBottom: theme.spacing.lg,
                },
              ]}
            >
              No bills yet — add one from the Bills tab.
            </Text>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back to Bills"
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
                Back to Bills
              </Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            // Outer vertical ScrollView. stickyHeaderIndices=[0] pins the
            // month-header row at the top while the bills scroll under.
            contentContainerStyle={styles.scrollContent}
            stickyHeaderIndices={[0]}
          >
            {/* Sticky header — index 0. Empty spacer for the name-column
                gutter, then a horizontal ScrollView of month labels. */}
            <View style={styles.stickyHeaderRow}>
              <View
                style={[
                  styles.nameHeaderSpacer,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderBottomWidth: theme.borderWidth.hairline,
                    borderRightWidth: theme.borderWidth.hairline,
                  },
                ]}
              />
              <Animated.ScrollView
                ref={headerScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={headerScrollHandler}
              >
                <View
                  style={[
                    styles.monthHeaderRow,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      borderBottomWidth: theme.borderWidth.hairline,
                    },
                  ]}
                >
                  {MONTH_LABELS.map((label) => (
                    <View key={label} style={styles.monthHeaderCell}>
                      <Text
                        style={[
                          theme.typography.label.md,
                          {
                            color: theme.colors.textFaint,
                            textTransform: 'uppercase',
                          },
                        ]}
                      >
                        {label}
                      </Text>
                    </View>
                  ))}
                </View>
              </Animated.ScrollView>
            </View>

            {/* Body — bill-name column + horizontal cell-rows ScrollView. */}
            <View style={styles.row}>
              <View style={styles.nameColumn}>
                {bills.map((bill) => (
                  <View
                    key={bill.id}
                    style={[
                      styles.nameCell,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                        borderBottomWidth: theme.borderWidth.hairline,
                        borderRightWidth: theme.borderWidth.hairline,
                      },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        theme.typography.body.sm,
                        { color: theme.colors.text },
                      ]}
                    >
                      {bill.name}
                    </Text>
                  </View>
                ))}
              </View>

              <Animated.ScrollView
                ref={bodyScrollRef}
                horizontal
                showsHorizontalScrollIndicator
                scrollEventThrottle={16}
                onScroll={bodyScrollHandler}
              >
                <View>
                  {bills.map((bill) => {
                    const paymentMap =
                      paymentsByBillByPeriod.get(bill.id) ??
                      EMPTY_PAYMENT_MAP;
                    const recents =
                      recentPaymentsByBill.get(bill.id) ?? EMPTY_PAYMENTS;
                    return (
                      <View key={bill.id} style={styles.cellRow}>
                        {periods.map((period) => {
                          const payment = paymentMap.get(period);
                          const cell = getYearGridCell(
                            bill,
                            period,
                            payment,
                            recents,
                          );
                          const walletColor =
                            cell.kind === 'paid'
                              ? accentColorFor(
                                  walletsById.get(cell.payment.wallet_id),
                                )
                              : null;
                          const onPress = () => {
                            if (cell.kind === 'paid') {
                              router.push({
                                pathname: '/bills/[id]/payment-details',
                                params: { id: bill.id, period },
                              });
                            } else if (cell.kind === 'forecast') {
                              router.push({
                                pathname: '/bills/[id]/mark-paid',
                                params: { id: bill.id },
                              });
                            }
                            // not_due → no-op
                          };
                          return (
                            <YearGridCell
                              key={period}
                              cell={cell}
                              walletColor={walletColor}
                              onPress={onPress}
                            />
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              </Animated.ScrollView>
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

// Sentinels so the per-row map/recent lookups don't allocate a fresh empty
// Map/array on every render when a bill has no payments.
const EMPTY_PAYMENT_MAP: Map<string, BillPayment> = new Map();
const EMPTY_PAYMENTS: BillPayment[] = [];

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
    scrollContent: {
      paddingBottom: theme.spacing.xxxl,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.xxl,
    },
    // Sticky header row paints the page background so content scrolling
    // beneath doesn't bleed through.
    stickyHeaderRow: {
      flexDirection: 'row',
      backgroundColor: theme.colors.bg,
    },
    nameHeaderSpacer: {
      width: NAME_COL_WIDTH,
      height: CELL_HEIGHT,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    nameColumn: {
      width: NAME_COL_WIDTH,
    },
    nameCell: {
      height: CELL_HEIGHT,
      paddingHorizontal: theme.spacing.md,
      justifyContent: 'center',
    },
    monthHeaderRow: {
      flexDirection: 'row',
      height: CELL_HEIGHT,
    },
    monthHeaderCell: {
      width: CELL_WIDTH,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellRow: {
      flexDirection: 'row',
    },
  });
}

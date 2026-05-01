// Year grid screen — the spreadsheet-style `bills × months` matrix.
//
// Per docs/PRD.md §"Supporting screens" — Year grid:
//   - Horizontally scrollable rows × months matrix.
//   - Cells tinted by wallet color when paid, dashed border for forecasts,
//     em-dash for non-due months.
//
// Layout strategy:
//   - The vertical body lives in a regular ScrollView.
//   - The month-header row is rendered SEPARATELY, absolutely positioned
//     over the top of the body. Always visible, always at the top — same
//     UX as a sticky header but without RN's stickyHeaderIndices breaking
//     flex layout for our specific row shape (spacer + horizontal scroll
//     side-by-side). The body's contentContainerStyle adds top padding
//     equal to the header height so content starts beneath it.
//   - Two horizontal Animated.ScrollViews (one in the sticky header, one
//     in the body) are synchronized via Reanimated worklets — each one's
//     onScroll handler calls scrollTo on the other. The sync runs on the
//     UI thread (no JS bridge crossings) so it stays smooth.
//
// Vertical scroll moves the bill-name column AND the cell rows together
// (they're both inside the body row of the body ScrollView). The bill-name
// column doesn't horizontally scroll, so it reads as visually pinned.

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
const STICKY_HEADER_HEIGHT = CELL_HEIGHT;

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

  // Refs + worklet handlers for the two horizontal scrolls (header row
  // above the body + cell-rows body). Each handler scrolls the OTHER list
  // to mirror its X offset. Worklets so the sync runs on the UI thread.
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
          <View style={styles.gridArea}>
            {/* Body ScrollView — vertical only. paddingTop reserves space
                for the absolutely-positioned sticky header above. */}
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator
            >
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

                <View style={styles.gridScrollWrapper}>
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
                          recentPaymentsByBill.get(bill.id) ??
                          EMPTY_PAYMENTS;
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
                                      walletsById.get(
                                        cell.payment.wallet_id,
                                      ),
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
              </View>
            </ScrollView>

            {/* Absolutely-positioned sticky header — sits above the body
                ScrollView (zIndex). Its row layout works normally because
                it's not a child of stickyHeaderIndices. */}
            <View
              pointerEvents="box-none"
              style={[
                styles.stickyHeaderAbsolute,
                {
                  backgroundColor: theme.colors.bg,
                  borderColor: theme.colors.border,
                  borderBottomWidth: theme.borderWidth.hairline,
                },
              ]}
            >
              {/* Gutter aligned with the bill-name column. Transparent — no
                  visible content; just occupies the space so the months
                  ScrollView starts at the correct x offset. */}
              <View
                style={{
                  width: NAME_COL_WIDTH,
                  height: STICKY_HEADER_HEIGHT,
                }}
              />
              <View style={styles.gridScrollWrapper}>
                <Animated.ScrollView
                  ref={headerScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  scrollEventThrottle={16}
                  onScroll={headerScrollHandler}
                >
                  <View style={styles.monthHeaderRow}>
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
            </View>
          </View>
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
    // Wraps the body ScrollView and the absolutely-positioned sticky
    // header. position: 'relative' on this view scopes the absolute
    // positioning to this region rather than the SafeAreaView root.
    gridArea: {
      flex: 1,
      position: 'relative',
    },
    scrollContent: {
      // Reserve space at the top for the absolutely-positioned sticky
      // header so the first body row isn't hidden underneath it.
      paddingTop: STICKY_HEADER_HEIGHT,
      paddingBottom: theme.spacing.xxxl,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.xxl,
    },
    // The sticky header is overlaid at the top of the gridArea. zIndex
    // (and elevation on Android) ensures it paints above the scroll
    // content. flexDirection: 'row' lays out the gutter spacer + months
    // ScrollView side-by-side without involving stickyHeaderIndices.
    stickyHeaderAbsolute: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: STICKY_HEADER_HEIGHT,
      flexDirection: 'row',
      zIndex: 10,
      elevation: 4,
    },
    // Wraps each horizontal Animated.ScrollView. flex:1 fills the
    // remaining horizontal space after the bill-name gutter so the
    // ScrollView has a constrained width and its content can scroll
    // horizontally beyond it.
    gridScrollWrapper: {
      flex: 1,
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
      height: STICKY_HEADER_HEIGHT,
      alignItems: 'center',
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

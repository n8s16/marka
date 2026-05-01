// Year grid screen — the spreadsheet-style `bills × months` matrix.
//
// Per docs/PRD.md §"Supporting screens" — Year grid:
//   - Horizontally scrollable rows × months matrix.
//   - Cells tinted by wallet color when paid, dashed border for forecasts,
//     em-dash for non-due months.
//
// Layout strategy: a single outer vertical ScrollView whose contents are a
// fixed-width bill-name column on the left and a horizontal ScrollView of
// month columns on the right. Vertical scroll moves the whole row (name +
// cells) together, which matches user expectations from a spreadsheet.
// Horizontal scroll only affects the cell grid, leaving the bill-name
// column visually pinned to the left.
//
// This isn't a true sticky-column (e.g. via two synchronized ScrollViews),
// but it gives the same UX with much less cross-platform risk. Synchronized
// scroll is on the table only if device-side testing reveals a need.
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
            // Outer vertical ScrollView. The two columns scroll together
            // vertically because they're siblings inside this view.
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.row}>
              {/* Left column: bill names. Same width as MonthHeader's name
                  spacer so columns line up. */}
              <View style={styles.nameColumn}>
                {/* Spacer cell aligned with the month-header row in the
                    right column so the first bill row sits at the same
                    Y as its cells. */}
                <View
                  style={[
                    styles.nameHeaderSpacer,
                    {
                      borderColor: theme.colors.border,
                      borderBottomWidth: theme.borderWidth.hairline,
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                />
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

              {/* Right column: month-header row + cell rows, all wrapped
                  in a horizontal ScrollView. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                // Keep the inner content tight against the left edge so
                // the seam between the name column and the first cell
                // column has no gap.
                contentContainerStyle={styles.gridContent}
              >
                <View>
                  {/* Month header row */}
                  <View
                    style={[
                      styles.monthHeaderRow,
                      {
                        borderColor: theme.colors.border,
                        borderBottomWidth: theme.borderWidth.hairline,
                        backgroundColor: theme.colors.surface,
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

                  {/* Cell rows */}
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
              </ScrollView>
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
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    nameColumn: {
      width: NAME_COL_WIDTH,
    },
    nameHeaderSpacer: {
      height: CELL_HEIGHT,
    },
    nameCell: {
      height: CELL_HEIGHT,
      paddingHorizontal: theme.spacing.md,
      justifyContent: 'center',
    },
    gridContent: {
      // No horizontal padding — the cells render their own hairline
      // borders that need to butt up against the name column edge.
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

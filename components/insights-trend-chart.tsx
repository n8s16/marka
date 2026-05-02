// 6-month outflow trend chart on the Insights tab.
//
// Per docs/PRD.md §"Main tabs" — Insights:
//   "6-month trend chart"
//
// Visual:
//   - Six vertical bars, one per month, oldest on the left.
//   - Each bar is a STACK of segments — one segment per wallet that
//     contributed in that period, colored by the wallet's brand color
//     (theme.walletBrand[key] for known names, wallet.color for custom).
//     Segments stack from bottom up in a stable wallet order so the
//     user reads the same wallet at the same vertical position across
//     all six bars.
//   - Bar heights scale to the maximum `total` across the six months.
//   - Past-month bars render at lower opacity so the current month
//     "pops" — same recede idiom as strikethrough-paid bills.
//   - Month abbreviations in small all-caps under each bar.
//   - The current (rightmost) bar's total prints above it as a number
//     anchor.
//   - When all six months are zero, render an empty-state caption
//     instead.
//
// Sizing: container width is measured via onLayout; height is fixed at
// `CHART_HEIGHT` (chart) + `LABEL_GUTTER` (month labels) +
// `TOP_LABEL_HEIGHT` (the number above the current bar). The component
// is "looks-right-ish" surface — visual verification is the user's
// responsibility.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { format as formatDate, parse as parseDateFns } from 'date-fns';

import { formatCurrency } from '@/logic/currency';
import type { PeriodWalletOutflow } from '@/logic/aggregations';
import type { Wallet } from '@/db/queries/wallets';
import { useTheme } from '@/state/theme';
import { accentColorFor } from '@/utils/wallet-color';

export interface InsightsTrendChartProps {
  /** Six points, oldest first. The hook guarantees this. */
  data: PeriodWalletOutflow[];
  /**
   * The active wallet list, used to resolve segment colors AND to fix
   * a stable bottom-to-top stack order across bars. Wallets that don't
   * appear in any period's data are skipped at render time but may
   * still be in this list — we don't filter the input.
   */
  wallets: Wallet[];
}

// Visual constants. Chart container ~140px tall as briefed; the SVG
// itself is slightly shorter so we have room above for the anchor
// number and below for the month labels.
const CHART_HEIGHT = 96;
const TOP_LABEL_HEIGHT = 18;
const LABEL_GUTTER = 24;
const TOTAL_HEIGHT = CHART_HEIGHT + TOP_LABEL_HEIGHT + LABEL_GUTTER;

// Bars sit in a horizontally evenly-spaced row. Each bar gets a fixed
// fraction of its slot so adjacent bars don't kiss.
const BAR_WIDTH_RATIO = 0.55;
// Tiny stub for non-zero segments that would round to invisible.
const MIN_SEGMENT_HEIGHT = 1;
const MIN_VISIBLE_RATIO = 0.015; // < this fraction of max → render as the stub
// At any window length, slots are sized as if the chart were showing
// 6 months in the visible container. With 6 or fewer periods the chart
// fills the container; with 12 or 24 periods the SVG extends past the
// container and the wrapper ScrollView handles horizontal panning so
// bars don't get visually cluttered.
const SLOTS_TO_FIT = 6;

export function InsightsTrendChart({
  data,
  wallets,
}: InsightsTrendChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // Per-period total = sum of byWallet entries. Used to scale heights.
  const totalsAndMax = useMemo(() => {
    const totals = data.map((p) => {
      let sum = 0;
      for (const v of p.byWallet.values()) sum += v;
      return sum;
    });
    let max = 0;
    for (const t of totals) {
      if (t > max) max = t;
    }
    return { totals, max };
  }, [data]);

  // Pre-compute the month-label strings once.
  const labels = useMemo(() => {
    return data.map((p) => {
      try {
        const d = parseDateFns(p.period, 'yyyy-MM', new Date(0));
        if (Number.isNaN(d.getTime())) return p.period;
        return formatDate(d, 'MMM').toUpperCase();
      } catch {
        return p.period;
      }
    });
  }, [data]);

  // Fixed wallet stack order: the order of the `wallets` prop. Stable
  // across re-renders and across bars, so the user reads "Maya at the
  // bottom" consistently. Wallets not in the array but appearing in
  // data (e.g. archived wallets that have history) get rendered at
  // the top with a fallback color — see segment-loop fallback below.
  const walletColorByIdRef = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of wallets) {
      const c = accentColorFor(w);
      if (c) map.set(w.id, c);
    }
    return map;
  }, [wallets]);

  function handleLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  // Empty-state: nothing to plot when every month is zero.
  if (totalsAndMax.max === 0) {
    return (
      <View
        style={[
          styles.container,
          {
            height: TOTAL_HEIGHT,
            marginHorizontal: theme.spacing.lg,
            marginBottom: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderWidth: theme.borderWidth.hairline,
            borderRadius: theme.radii.md,
          },
        ]}
      >
        <Text
          style={[
            theme.typography.body.sm,
            { color: theme.colors.textMuted, textAlign: 'center' },
          ]}
        >
          Not enough history to show a trend yet — keep logging.
        </Text>
      </View>
    );
  }

  // Slot sizing: each slot is `containerWidth / SLOTS_TO_FIT` wide so the
  // visual density at any window length matches the 6-month layout. With
  // ≤ 6 periods the SVG is narrower than the container; we'd want it to
  // FILL the container in that case, so size to `data.length` slots
  // instead. With > 6 periods the SVG extends and the ScrollView pans.
  const innerWidth = width - theme.spacing.sm * 2;
  const slotsForSlotSizing = Math.min(data.length, SLOTS_TO_FIT);
  const slotWidth = width > 0 ? innerWidth / slotsForSlotSizing : 0;
  const barWidth = slotWidth * BAR_WIDTH_RATIO;
  const svgWidth = slotWidth * data.length;

  const currentIdx = data.length - 1;
  const currentTotal = totalsAndMax.totals[currentIdx] ?? 0;

  // When the chart is wider than the container, scroll to the end so the
  // user lands on the current (rightmost) month — same default focus as
  // the rest of the app's "current month" framing. Re-fires when data
  // length changes (e.g. user picks a longer window).
  useEffect(() => {
    if (svgWidth > innerWidth && scrollRef.current && innerWidth > 0) {
      // Defer one frame so the ScrollView has its content laid out.
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: false });
      });
    }
  }, [svgWidth, innerWidth]);

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.container,
        {
          height: TOTAL_HEIGHT,
          marginHorizontal: theme.spacing.lg,
          marginBottom: theme.spacing.md,
          paddingHorizontal: theme.spacing.sm,
          paddingTop: theme.spacing.xs,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: theme.borderWidth.hairline,
          borderRadius: theme.radii.md,
        },
      ]}
    >
      {width > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={svgWidth > innerWidth}
          // Disable scroll when content fits — keeps the gesture from
          // intercepting taps unnecessarily for short windows.
          scrollEnabled={svgWidth > innerWidth}
        >
        <Svg width={svgWidth} height={TOTAL_HEIGHT - theme.spacing.xs}>
          {/* Stacked bars — one Rect per (period, wallet) segment. */}
          {data.map((point, periodIdx) => {
            const periodTotal = totalsAndMax.totals[periodIdx] ?? 0;
            if (periodTotal === 0) return null;

            const slotLeft = slotWidth * periodIdx;
            const x = slotLeft + (slotWidth - barWidth) / 2;
            const isCurrent = periodIdx === currentIdx;
            // Past-month opacity — current bar pops at full opacity.
            const opacity = isCurrent ? 1 : 0.55;

            // Stack segments from bottom up in the wallets[] order. We
            // first render any wallets present in the data IN that order;
            // any data-keyed walletIds not in the active list (archived
            // wallets with historical contributions) get appended at the
            // top with a neutral fallback color so the visual remains
            // honest about total height.
            const seenIds = new Set<string>();
            const segments: Array<{
              walletId: string;
              amount: number;
              color: string;
            }> = [];

            for (const w of wallets) {
              const amount = point.byWallet.get(w.id);
              if (amount && amount > 0) {
                segments.push({
                  walletId: w.id,
                  amount,
                  color:
                    walletColorByIdRef.get(w.id) ?? theme.walletBrand.fallback,
                });
                seenIds.add(w.id);
              }
            }
            for (const [walletId, amount] of point.byWallet) {
              if (seenIds.has(walletId)) continue;
              if (amount > 0) {
                segments.push({
                  walletId,
                  amount,
                  color:
                    walletColorByIdRef.get(walletId) ??
                    theme.walletBrand.fallback,
                });
              }
            }

            // Cumulative offset from the chart bottom.
            const chartBottomY = TOP_LABEL_HEIGHT + CHART_HEIGHT;
            let cumulativeBottom = chartBottomY;
            const rects: React.ReactElement[] = [];
            for (const seg of segments) {
              const ratio = seg.amount / totalsAndMax.max;
              const rawHeight = ratio * CHART_HEIGHT;
              const segmentHeight =
                ratio < MIN_VISIBLE_RATIO ? MIN_SEGMENT_HEIGHT : rawHeight;
              const y = cumulativeBottom - segmentHeight;
              rects.push(
                <Rect
                  key={`${point.period}-${seg.walletId}`}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={segmentHeight}
                  fill={seg.color}
                  opacity={opacity}
                />,
              );
              cumulativeBottom = y;
            }
            return rects;
          })}

          {/* Anchor number above the current (rightmost) bar. */}
          {currentTotal > 0 ? (
            <SvgText
              x={slotWidth * currentIdx + slotWidth / 2}
              y={TOP_LABEL_HEIGHT - 4}
              fontSize={11}
              fontWeight="500"
              fill={theme.colors.text}
              textAnchor="middle"
            >
              {formatCurrency(currentTotal)}
            </SvgText>
          ) : null}

          {/* Month labels under each bar. */}
          {labels.map((label, idx) => {
            const cx = slotWidth * idx + slotWidth / 2;
            return (
              <SvgText
                key={`${data[idx]?.period ?? idx}-label`}
                x={cx}
                y={TOP_LABEL_HEIGHT + CHART_HEIGHT + 14}
                fontSize={10}
                fontWeight="400"
                fill={theme.colors.textFaint}
                textAnchor="middle"
              >
                {label}
              </SvgText>
            );
          })}
        </Svg>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});

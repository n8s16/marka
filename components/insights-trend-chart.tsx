// 6-month outflow trend chart on the Insights tab.
//
// Per docs/PRD.md §"Main tabs" — Insights:
//   "6-month trend chart"
//
// Visual:
//   - Six vertical bars, one per month, oldest on the left.
//   - Bar heights scale to the maximum `total` across the six months.
//   - Single-color bars (theme.colors.accent). Not stacked — bills and
//     spending share the bar height. v1 keeps the visual simple.
//   - Month abbreviations in small all-caps under each bar.
//   - The current (rightmost) bar's total prints above it as a number anchor.
//   - When all six months are zero, render an empty-state caption instead.
//
// Sizing: container width is measured via onLayout; height is fixed at
// `CHART_HEIGHT` (chart) + `LABEL_GUTTER` (month labels) + `TOP_LABEL_HEIGHT`
// (the number above the current bar). The component is "looks-right-ish"
// surface — visual verification is the user's responsibility.

import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { format as formatDate, parse as parseDateFns } from 'date-fns';

import { formatCurrency } from '@/logic/currency';
import type { MonthlyOutflowPoint } from '@/logic/aggregations';
import { useTheme } from '@/state/theme';

export interface InsightsTrendChartProps {
  /** Six points, oldest first. The hook guarantees this. */
  data: MonthlyOutflowPoint[];
}

// Visual constants. Chart container ~140px tall as briefed; the SVG itself
// is slightly shorter so we have room above for the anchor number and below
// for the month labels.
const CHART_HEIGHT = 96;
const TOP_LABEL_HEIGHT = 18;
const LABEL_GUTTER = 24;
const TOTAL_HEIGHT = CHART_HEIGHT + TOP_LABEL_HEIGHT + LABEL_GUTTER;

// Bars sit in a horizontally evenly-spaced row. We give each bar a fixed
// fraction of its slot so adjacent bars don't kiss.
const BAR_WIDTH_RATIO = 0.55;
const MIN_BAR_HEIGHT = 2; // tiny stub even for non-zero months so they're visible
const MIN_VISIBLE_RATIO = 0.04; // < this fraction of max → render as the stub

export function InsightsTrendChart({ data }: InsightsTrendChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  const max = useMemo(() => {
    let m = 0;
    for (const p of data) {
      if (p.total > m) m = p.total;
    }
    return m;
  }, [data]);

  // Pre-compute the month-label strings once. Periods are `YYYY-MM`; date-fns
  // parses them via the format token to avoid timezone ambiguity.
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

  function handleLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  // Empty-state: nothing to plot when every month is zero.
  if (max === 0) {
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

  // Layout math is only valid once we know the container width. Render an
  // empty placeholder on the first frame; the next layout pass fills it in.
  const slotWidth = width > 0 ? width / data.length : 0;
  const barWidth = slotWidth * BAR_WIDTH_RATIO;

  // Highlight the rightmost (current) bar with the anchor amount above it.
  const currentIdx = data.length - 1;
  const currentTotal = data[currentIdx]?.total ?? 0;

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
        <Svg width={width - theme.spacing.sm * 2} height={TOTAL_HEIGHT - theme.spacing.xs}>
          {data.map((point, idx) => {
            const ratio = point.total / max;
            const rawHeight = ratio * CHART_HEIGHT;
            // Visible stub for non-zero months that would otherwise be too
            // small to read. Months with zero stay at zero (no bar at all).
            const barHeight =
              point.total === 0
                ? 0
                : ratio < MIN_VISIBLE_RATIO
                  ? MIN_BAR_HEIGHT
                  : rawHeight;

            const slotLeft = (width - theme.spacing.sm * 2) * (idx / data.length);
            const usableSlotWidth = (width - theme.spacing.sm * 2) / data.length;
            const x = slotLeft + (usableSlotWidth - barWidth) / 2;
            const y = TOP_LABEL_HEIGHT + (CHART_HEIGHT - barHeight);

            const isCurrent = idx === currentIdx;
            const fill = isCurrent ? theme.colors.accent : theme.colors.accent;
            // Past-month bars render slightly muted via opacity so the current
            // month stands out as "where you are now" — same idiom as
            // strikethrough-paid: the active item pops, the rest recedes.
            const opacity = isCurrent ? 1 : 0.55;

            return (
              <Rect
                key={point.period}
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={2}
                fill={fill}
                opacity={opacity}
              />
            );
          })}

          {/* Anchor number above the current (rightmost) bar. Centered over
              its slot. We only print this when the current bar has a total —
              if the current month is zero, no anchor is needed. */}
          {currentTotal > 0 ? (
            <SvgText
              x={(() => {
                const usableSlotWidth = (width - theme.spacing.sm * 2) / data.length;
                return usableSlotWidth * currentIdx + usableSlotWidth / 2;
              })()}
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
            const usableSlotWidth = (width - theme.spacing.sm * 2) / data.length;
            const cx = usableSlotWidth * idx + usableSlotWidth / 2;
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});

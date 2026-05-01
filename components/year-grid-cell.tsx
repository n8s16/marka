// A single cell in the Year grid (`bills × months` matrix).
//
// Visual rules (verbatim from docs/PRD.md §"Behavior decisions" and
// docs/DATA_MODEL.md §"Year grid cell resolution"):
//
//   - paid:     formatted amount, strikethrough, opacity 0.55, background
//               tinted with the wallet brand color at low alpha (~15% in
//               light mode, ~25% in dark mode — neutral-gray and pure-blue
//               wallets need a stronger tint to read against dark surfaces).
//               Text color stays the theme's body text color — strikethrough
//               + opacity convey "paid"; wallet tint conveys "from this
//               wallet".
//   - forecast: formatted amount, dashed hairline border, no fill, text in
//               theme.colors.textMuted.
//   - not_due:  centered em-dash in theme.colors.textFaint. No border, no
//               background.
//
// Cell sizing is fixed (CELL_WIDTH × CELL_HEIGHT) so columns line up across
// the grid. The matching BillNameCell in app/year-grid.tsx uses the same
// CELL_HEIGHT for vertical row alignment.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCurrency } from '@/logic/currency';
import type { YearGridCell as YearGridCellModel } from '@/logic/year-grid';
import { useTheme } from '@/state/theme';

export const CELL_WIDTH = 80;
export const CELL_HEIGHT = 52;

export interface YearGridCellProps {
  cell: YearGridCellModel;
  // Resolved by the parent for paid cells (via accentColorFor + walletsById);
  // null for forecast/not_due cells.
  walletColor: string | null;
  onPress: () => void;
}

/**
 * Append a low-alpha hex byte to a 6-digit hex color so the wallet brand
 * shows through at low opacity. Relies on every wallet color being stored
 * as a 6-digit hex (which the seeded set and the fallback both satisfy).
 * Falls back to the input string unchanged if it doesn't match — better to
 * render slightly-wrong than to crash on an unexpected format.
 *
 * Alpha varies by theme mode:
 *   - light: 0x26 (≈15%) — tuned against light surfaces.
 *   - dark:  0x40 (≈25%) — neutral-gray and pure-blue wallets lose
 *            visibility against dark surfaces at 15%.
 */
function withLowAlpha(hex: string, mode: 'light' | 'dark'): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return hex;
  const alpha = mode === 'dark' ? '40' : '26';
  return `${hex}${alpha}`;
}

export function YearGridCell({
  cell,
  walletColor,
  onPress,
}: YearGridCellProps) {
  const theme = useTheme();

  if (cell.kind === 'paid') {
    const tint = walletColor ? withLowAlpha(walletColor, theme.mode) : 'transparent';
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.cell,
          {
            backgroundColor: pressed ? theme.colors.surfaceMuted : tint,
            borderColor: theme.colors.border,
            borderRightWidth: theme.borderWidth.hairline,
            borderBottomWidth: theme.borderWidth.hairline,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            theme.typography.label.md,
            {
              color: theme.colors.text,
              opacity: theme.opacity.paid,
              textDecorationLine: 'line-through',
            },
          ]}
        >
          {formatCurrency(cell.payment.amount)}
        </Text>
      </Pressable>
    );
  }

  if (cell.kind === 'forecast') {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.cell,
          styles.forecastCell,
          {
            backgroundColor: pressed
              ? theme.colors.surfaceMuted
              : 'transparent',
            // Outer hairline keeps cells aligned with paid cells.
            borderColor: theme.colors.border,
            borderRightWidth: theme.borderWidth.hairline,
            borderBottomWidth: theme.borderWidth.hairline,
          },
        ]}
      >
        {/* Inner dashed-border view — RN renders dashed borders most
            reliably on a child view rather than the Pressable itself,
            which can clash with the cell's hairline grid borders. */}
        <View
          style={[
            styles.forecastInner,
            {
              borderColor: theme.colors.border,
              borderStyle: 'dashed',
              borderWidth: theme.borderWidth.hairline,
              borderRadius: theme.radii.sm,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              theme.typography.label.md,
              { color: theme.colors.textMuted },
            ]}
          >
            {formatCurrency(cell.amount)}
          </Text>
        </View>
      </Pressable>
    );
  }

  // not_due
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // not_due cells aren't navigable — onPress is a no-op upstream — but
      // the Pressable still gives a faint tap feedback for parity with the
      // other cell kinds, so mis-taps don't feel dead.
      style={({ pressed }) => [
        styles.cell,
        {
          backgroundColor: pressed
            ? theme.colors.surfaceMuted
            : 'transparent',
          borderColor: theme.colors.border,
          borderRightWidth: theme.borderWidth.hairline,
          borderBottomWidth: theme.borderWidth.hairline,
        },
      ]}
    >
      <Text
        style={[theme.typography.body.sm, { color: theme.colors.textFaint }]}
      >
        —
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  forecastCell: {
    padding: 4,
  },
  forecastInner: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});

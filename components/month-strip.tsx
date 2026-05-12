// Date-strip beneath each month row.
//
// Two density modes:
//
//   - 'slim'    — one segment per bill due in the month, in cadence
//                  order (by dueDay). Each segment is colored by the
//                  wallet associated with that bill's status: full
//                  wallet colour when paid, a faint placeholder pill
//                  for unpaid. The user reads the strip as
//                  "X bills total, this many done so far" — a
//                  progress bar at a glance. Cells with no bills
//                  show a single faint placeholder so the row keeps
//                  its visual rhythm.
//
//   - 'full'    — one cell per day of the month (daysInMonth cells laid
//                  out in a single row, equal widths). Each day's render
//                  depends on the cell's status:
//                    paid:     filled with the payment's wallet colour at
//                              55% alpha (the strikethrough-paid idiom)
//                    overdue:  dashed border in warning colour + faint
//                              warning fill
//                    upcoming: dashed border in muted border colour, no
//                              fill
//                  Days with no bills render as transparent placeholders
//                  so day positions stay aligned with the calendar grid.
//
// Multiple bills on the same day in the full strip: the first cell
// (sorted by bill name) wins for colour / status. The bill list below
// the strip is the authoritative source — the strip is a glance, not
// a ledger.

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Wallet } from '@/db/queries/wallets';
import type { MonthDayCell } from '@/logic/year-view';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';
import { accentColorFor } from '@/utils/wallet-color';

export interface MonthStripProps {
  /** All cells for the month, sorted by dueDay asc, bill name asc. */
  cells: MonthDayCell[];
  daysInMonth: number;
  /** Wallet lookup for resolving brand colours from payment.wallet_id. */
  walletsById: Map<string, Wallet>;
  density: 'slim' | 'full';
}

export function MonthStrip({
  cells,
  daysInMonth,
  walletsById,
  density,
}: MonthStripProps) {
  if (density === 'slim') {
    return <SlimStrip cells={cells} walletsById={walletsById} />;
  }
  return <FullStrip cells={cells} daysInMonth={daysInMonth} walletsById={walletsById} />;
}

// ---------- Slim variant: one segment per bill ----------

interface SlimStripProps {
  cells: MonthDayCell[];
  walletsById: Map<string, Wallet>;
}

function SlimStrip({ cells, walletsById }: SlimStripProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Empty month: render a single placeholder pill so the row keeps its
  // visual rhythm and the user reads "no bills tracked" without the
  // strip area looking broken or missing.
  if (cells.length === 0) {
    return (
      <View style={styles.slimRow}>
        <View
          style={[
            styles.slimSegment,
            { backgroundColor: theme.colors.surfaceMuted, opacity: 0.5 },
          ]}
        />
      </View>
    );
  }

  return (
    <View style={styles.slimRow}>
      {cells.map((cell, i) => {
        const color = colorForCell(cell, walletsById, theme);
        const isPaid = cell.status.kind === 'paid';
        return (
          <View
            key={`${cell.bill.id}-${i}`}
            style={[
              styles.slimSegment,
              {
                backgroundColor: color,
                // Paid bills hit full saturation; unpaid use a muted
                // version of the wallet colour so the strip still
                // identifies which wallet is on deck without claiming
                // the bill has been settled.
                opacity: isPaid ? 1 : 0.35,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

// ---------- Full variant: daysInMonth cells ----------

interface FullStripProps {
  cells: MonthDayCell[];
  daysInMonth: number;
  walletsById: Map<string, Wallet>;
}

function FullStrip({ cells, daysInMonth, walletsById }: FullStripProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // First-bill-wins lookup keyed by dueDay. Cells are already sorted by
  // dueDay asc, name asc, so iterating in order and skipping subsequent
  // hits on the same day produces the expected "first by name" winner.
  const byDay = useMemo(() => {
    const m = new Map<number, MonthDayCell>();
    for (const c of cells) {
      if (!m.has(c.dueDay)) m.set(c.dueDay, c);
    }
    return m;
  }, [cells]);

  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth],
  );

  return (
    <View style={styles.fullRow}>
      {days.map((day) => {
        const cell = byDay.get(day);
        if (!cell) {
          return <View key={day} style={styles.fullCellEmpty} />;
        }
        return <FullDayCell key={day} cell={cell} walletsById={walletsById} />;
      })}
    </View>
  );
}

interface FullDayCellProps {
  cell: MonthDayCell;
  walletsById: Map<string, Wallet>;
}

function FullDayCell({ cell, walletsById }: FullDayCellProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const status = cell.status;
  if (status.kind === 'paid') {
    const color = colorForCell(cell, walletsById, theme);
    return (
      <View
        style={[
          styles.fullCell,
          {
            backgroundColor: color ?? theme.walletBrand.fallback,
            opacity: theme.opacity.paid,
          },
        ]}
      />
    );
  }

  if (status.kind === 'overdue') {
    return (
      <View
        style={[
          styles.fullCell,
          styles.fullCellDashed,
          {
            borderColor: theme.colors.warning,
            backgroundColor: theme.colors.warning,
            opacity: 0.18,
          },
        ]}
      />
    );
  }

  // upcoming
  return (
    <View
      style={[
        styles.fullCell,
        styles.fullCellDashed,
        { borderColor: theme.colors.border },
      ]}
    />
  );
}

// ---------- Colour helper ----------

function colorForCell(
  cell: MonthDayCell,
  walletsById: Map<string, Wallet>,
  theme: Theme,
): string {
  if (cell.status.kind === 'paid') {
    const wallet = walletsById.get(cell.status.payment.wallet_id);
    return accentColorFor(wallet) ?? theme.walletBrand.fallback;
  }
  // Unpaid: tint by the bill's default wallet for consistency with where
  // the user is likely to pay it from.
  const wallet = walletsById.get(cell.bill.default_wallet_id);
  return accentColorFor(wallet) ?? theme.walletBrand.fallback;
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    slimRow: {
      flexDirection: 'row',
      gap: 4,
      height: 6,
      alignItems: 'stretch',
    },
    slimSegment: {
      flex: 1,
      borderRadius: 3,
    },
    fullRow: {
      flexDirection: 'row',
      gap: 2,
      height: 12,
      alignItems: 'stretch',
    },
    fullCell: {
      flex: 1,
      borderRadius: 2,
    },
    fullCellEmpty: {
      flex: 1,
    },
    fullCellDashed: {
      borderWidth: 1,
      borderStyle: 'dashed',
    },
  });
}


// Period picker — pressable that opens a modal listing nearby due-periods
// for a given Bill, used by the mark-as-paid sheet.
//
// PRD §"Behavior decisions": "the period defaults to the bill's expected
// due-month [...]; the user can change it via a dropdown showing nearby
// due-periods." This component renders that dropdown.
//
// Window sizing per cadence — we want enough context without overwhelming
// the list (the agent's call per the brief, documented here):
//   - Monthly (step 1): 6 months back, 6 months forward → ~12 candidates.
//   - Quarterly (step 3): 12 months back, 12 months forward → ~8 candidates.
//   - Yearly (step 12): 24 months back, 24 months forward → ~4–5 candidates.
//   - Custom (step n): n*4 back, n*4 forward → ~8 candidates.
//
// A "Suggested" tag marks the smart-default candidate; a "Paid" tag marks
// periods that already have a payment. The picker still renders paid
// periods so the user can intentionally re-select one and trigger the
// overwrite flow upstream.

import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { format as formatDateFns, parseISO } from 'date-fns';

import { useTheme } from '@/state/theme';
import {
  getSmartDefaultPeriodForPayment,
  listDuePeriodsInRange,
  type BillCadence,
  type BillDueDay,
} from '@/logic/periods';
import type { Theme } from '@/styles/theme';

export interface PeriodPickerProps {
  /** The bill whose due-periods we're enumerating. */
  bill: BillDueDay;
  /** Currently selected period (`YYYY-MM`). */
  value: string;
  onChange: (period: string) => void;
  /** "Now" — passed in so callers can keep one Date per render. */
  today: Date;
  /** Already-paid periods for this bill (drives the "Paid" tag and smart default). */
  paidPeriods: string[];
  label?: string;
  error?: string | null;
  disabled?: boolean;
}

function windowMonths(bill: BillCadence): { back: number; forward: number } {
  switch (bill.frequency) {
    case 'monthly':
      return { back: 6, forward: 6 };
    case 'quarterly':
      return { back: 12, forward: 12 };
    case 'yearly':
      return { back: 24, forward: 24 };
    case 'custom': {
      const n = bill.interval_months ?? 1;
      const span = Math.max(4 * Math.max(1, n), 6);
      return { back: span, forward: span };
    }
    default:
      return { back: 6, forward: 6 };
  }
}

function todayPeriodString(today: Date): string {
  const y = today.getFullYear();
  const m = (today.getMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

function shiftPeriod(period: string, deltaMonths: number): string {
  const d = parseISO(`${period}-01`);
  d.setMonth(d.getMonth() + deltaMonths);
  return formatDateFns(d, 'yyyy-MM');
}

function formatPeriodLabel(period: string): string {
  if (!/^\d{4}-\d{2}$/.test(period)) return period;
  return formatDateFns(parseISO(`${period}-01`), 'MMMM yyyy');
}

export function PeriodPicker({
  bill,
  value,
  onChange,
  today,
  paidPeriods,
  label,
  error,
  disabled,
}: PeriodPickerProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [open, setOpen] = useState(false);

  const candidates = useMemo(() => {
    const tp = todayPeriodString(today);
    const { back, forward } = windowMonths(bill);
    return listDuePeriodsInRange(
      bill,
      shiftPeriod(tp, -back),
      shiftPeriod(tp, forward),
    );
  }, [bill, today]);

  // Always include the current `value` in the list — even if it falls
  // outside our window — so the user can see what they have selected.
  const displayList = useMemo(() => {
    if (candidates.includes(value) || !value) return candidates;
    const merged = [...candidates, value].sort((a, b) => a.localeCompare(b));
    return merged;
  }, [candidates, value]);

  const suggested = useMemo(
    () => getSmartDefaultPeriodForPayment(bill, today, paidPeriods),
    [bill, today, paidPeriods],
  );

  const paidSet = useMemo(() => new Set(paidPeriods), [paidPeriods]);

  return (
    <View>
      {label ? <Text style={[theme.typography.label.md, styles.label]}>{label}</Text> : null}
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${formatPeriodLabel(value)}` : formatPeriodLabel(value)}
        style={[
          styles.field,
          {
            borderColor: error ? theme.colors.danger : theme.colors.border,
            opacity: disabled ? theme.opacity.disabled : 1,
          },
        ]}
      >
        <Text style={[theme.typography.body.md, { color: theme.colors.text }]}>
          {formatPeriodLabel(value)}
        </Text>
      </Pressable>
      {error ? (
        <Text
          style={[theme.typography.label.sm, styles.errorText, { color: theme.colors.danger }]}
        >
          {error}
        </Text>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            // Inner Pressable swallows backdrop taps without dismissing.
            onPress={(e) => e.stopPropagation()}
            style={[styles.sheet, { backgroundColor: theme.colors.surface }]}
          >
            <Text
              style={[
                theme.typography.title.sm,
                { color: theme.colors.text, marginBottom: theme.spacing.md },
              ]}
            >
              Select period
            </Text>
            <FlatList
              data={displayList}
              keyExtractor={(p) => p}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = item === value;
                const isSuggested = item === suggested;
                const isPaid = paidSet.has(item);
                return (
                  <Pressable
                    onPress={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    style={({ pressed }) => [
                      styles.itemRow,
                      {
                        backgroundColor: pressed
                          ? theme.colors.surfaceMuted
                          : isSelected
                            ? theme.colors.surfaceMuted
                            : 'transparent',
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        theme.typography.body.md,
                        {
                          color: theme.colors.text,
                          fontWeight: isSelected
                            ? theme.typography.weights.medium
                            : theme.typography.weights.regular,
                        },
                      ]}
                    >
                      {formatPeriodLabel(item)}
                    </Text>
                    <View style={styles.tagRow}>
                      {isSuggested ? (
                        <View
                          style={[
                            styles.tag,
                            { backgroundColor: theme.colors.surfaceMuted },
                          ]}
                        >
                          <Text
                            style={[
                              theme.typography.label.sm,
                              { color: theme.colors.textMuted },
                            ]}
                          >
                            Suggested
                          </Text>
                        </View>
                      ) : null}
                      {isPaid ? (
                        <View
                          style={[
                            styles.tag,
                            { backgroundColor: theme.colors.surfaceMuted },
                          ]}
                        >
                          <Text
                            style={[
                              theme.typography.label.sm,
                              { color: theme.colors.success },
                            ]}
                          >
                            Paid
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text
                  style={[
                    theme.typography.body.sm,
                    { color: theme.colors.textMuted, padding: theme.spacing.lg },
                  ]}
                >
                  No nearby due-periods. The bill's first due-month is in the future.
                </Text>
              }
            />
            <Pressable
              onPress={() => setOpen(false)}
              hitSlop={8}
              style={styles.cancelRow}
              accessibilityRole="button"
            >
              <Text style={[theme.typography.body.sm, { color: theme.colors.accent }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    label: {
      color: theme.colors.textMuted,
      marginBottom: theme.spacing.xs,
    },
    field: {
      borderWidth: theme.borderWidth.hairline,
      borderRadius: theme.radii.sm,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      backgroundColor: theme.colors.surface,
    },
    errorText: {
      marginTop: theme.spacing.xs,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      borderTopLeftRadius: theme.radii.lg,
      borderTopRightRadius: theme.radii.lg,
      padding: theme.spacing.lg,
      maxHeight: '70%',
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      borderBottomWidth: theme.borderWidth.hairline,
    },
    tagRow: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    tag: {
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 2,
      borderRadius: theme.radii.round,
    },
    cancelRow: {
      paddingTop: theme.spacing.md,
      alignItems: 'center',
    },
  });
}

// Tap-to-edit date / period / time inputs.
//
// Uses @react-native-community/datetimepicker (pinned 8.4.4 — Expo SDK 54
// compatible). The picker behaves very differently per platform; we honor
// each platform's idioms:
//
//   - Android: rendering the picker auto-presents a native dialog. We render
//     it inline (mount-on-open) and let Android handle the modal chrome.
//   - iOS: the picker renders *inline* in the host view (no auto-modal). To
//     avoid the "tap and nothing appears" UX (the spinner can render below
//     the visible region or overlap other fields), we wrap it in our own
//     <Modal> with a Done button. Tapping the field opens the modal,
//     spinning commits each change, Done dismisses.
//
// All wire-protocol values are stable strings: YYYY-MM-DD for dates,
// YYYY-MM for periods, HH:mm 24h for times. date-fns parses/formats both
// directions.

import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { format as formatDateFns, parseISO } from 'date-fns';

import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

// ─── Shared modal wrapper (iOS) ──────────────────────────────────────────────

interface IosPickerModalProps {
  visible: boolean;
  onDone: () => void;
  children: React.ReactNode;
}

function IosPickerModal({ visible, onDone, children }: IosPickerModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDone}
    >
      <Pressable style={styles.backdrop} onPress={onDone}>
        <Pressable
          // Inner Pressable swallows backdrop taps so spinning doesn't dismiss.
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheet, { backgroundColor: theme.colors.surface }]}
        >
          {children}
          <Pressable onPress={onDone} hitSlop={8} style={styles.doneRow}>
            <Text
              style={[
                theme.typography.body.md,
                {
                  color: theme.colors.accent,
                  fontWeight: theme.typography.weights.medium,
                },
              ]}
            >
              Done
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Date input (YYYY-MM-DD) ─────────────────────────────────────────────────

export interface DateInputProps {
  /** ISO `YYYY-MM-DD`. */
  value: string;
  onChange: (next: string) => void;
  label?: string;
  error?: string | null;
  disabled?: boolean;
  /** Override the displayed format string (date-fns). Default: "MMM d, yyyy". */
  displayFormat?: string;
}

export function DateInput({
  value,
  onChange,
  label,
  error,
  disabled,
  displayFormat = 'MMM d, yyyy',
}: DateInputProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [open, setOpen] = useState(false);

  const date = parseSafeYmd(value) ?? new Date();
  const display = (() => {
    const parsed = parseSafeYmd(value);
    if (!parsed) return value || '—';
    return formatDateFns(parsed, displayFormat);
  })();

  function handleChange(event: DateTimePickerEvent, selected?: Date) {
    // Android closes the dialog on its own; iOS stays open so the user can
    // keep spinning until they hit Done.
    if (Platform.OS === 'android') {
      setOpen(false);
      if (event.type === 'dismissed') return;
    }
    if (!selected) return;
    onChange(formatDateFns(selected, 'yyyy-MM-dd'));
  }

  return (
    <View>
      {label ? (
        <Text style={[theme.typography.label.md, styles.label]}>{label}</Text>
      ) : null}
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${display}` : display}
        style={[
          styles.field,
          {
            borderColor: error ? theme.colors.danger : theme.colors.border,
            opacity: disabled ? theme.opacity.disabled : 1,
          },
        ]}
      >
        <Text style={[theme.typography.body.md, { color: theme.colors.text }]}>
          {display}
        </Text>
      </Pressable>

      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          onChange={handleChange}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <IosPickerModal visible={open} onDone={() => setOpen(false)}>
          <DateTimePicker
            value={date}
            mode="date"
            display="spinner"
            // Bind the spinner's chrome to our theme so its wheel text stays
            // legible against our modal sheet's surface. Without this, an iOS
            // device in system dark mode could render the spinner with
            // white-on-white text against our light surface (or vice versa
            // when our app is dark and the OS is light).
            themeVariant={theme.mode}
            textColor={theme.colors.text}
            onChange={handleChange}
          />
        </IosPickerModal>
      ) : null}

      {error ? (
        <Text
          style={[
            theme.typography.label.sm,
            styles.errorText,
            { color: theme.colors.danger },
          ]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Period input (YYYY-MM) ──────────────────────────────────────────────────
//
// Used for `start_period` ("First due month") on the bill form. Unlike date
// and time, the data model carries no day component for periods — they're
// strictly `YYYY-MM`. Using `<DateTimePicker>` here would show a day field
// that the user thinks matters but we silently drop in `onChange`. That
// surfaced as a real source of confusion during testing: users entered Due
// Day separately, then saw a day field again here and wondered which one
// won.
//
// Solution: a custom modal with a scrollable list of months. No day field
// exposed at all. Cross-platform (no native picker quirks). The list spans
// 24 months back and 24 months forward from today; that's enough for both
// "I'm setting up a bill that started a year ago" backfilling and "this
// bill starts in a few months" planning. The currently selected month, if
// outside that window, is appended so it remains visible.

const PERIOD_WINDOW_MONTHS_BACK = 24;
const PERIOD_WINDOW_MONTHS_FORWARD = 24;
const PERIOD_ITEM_HEIGHT = 48;

export interface PeriodInputProps {
  /** YYYY-MM. */
  value: string;
  onChange: (next: string) => void;
  label?: string;
  error?: string | null;
  disabled?: boolean;
  helper?: string;
}

export function PeriodInput({
  value,
  onChange,
  label,
  error,
  disabled,
  helper,
}: PeriodInputProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [open, setOpen] = useState(false);

  const display = (() => {
    const parsed = parseSafePeriod(value);
    if (!parsed) return value || '—';
    return formatDateFns(parsed, 'MMMM yyyy');
  })();

  // Build a window of YYYY-MM strings around today. Pinned to mount so the
  // list doesn't shift while the user scrolls.
  const months = useMemo(() => {
    const today = new Date();
    const result: string[] = [];
    for (
      let i = -PERIOD_WINDOW_MONTHS_BACK;
      i <= PERIOD_WINDOW_MONTHS_FORWARD;
      i++
    ) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      result.push(formatDateFns(d, 'yyyy-MM'));
    }
    // Make sure the currently selected value is reachable, even if it's
    // outside the window (e.g. a backfilled bill from 5 years ago).
    if (value && /^\d{4}-\d{2}$/.test(value) && !result.includes(value)) {
      result.push(value);
      result.sort((a, b) => a.localeCompare(b));
    }
    return result;
  }, [value]);

  // Index of the selected value, used to scroll the list into view on open.
  const initialIndex = useMemo(() => {
    const i = months.indexOf(value);
    return i >= 0 ? i : 0;
  }, [months, value]);

  return (
    <View>
      {label ? (
        <Text style={[theme.typography.label.md, styles.label]}>{label}</Text>
      ) : null}
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${display}` : display}
        style={[
          styles.field,
          {
            borderColor: error ? theme.colors.danger : theme.colors.border,
            opacity: disabled ? theme.opacity.disabled : 1,
          },
        ]}
      >
        <Text style={[theme.typography.body.md, { color: theme.colors.text }]}>
          {display}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            // Inner Pressable swallows backdrop taps so list scrolling
            // doesn't dismiss.
            onPress={(e) => e.stopPropagation()}
            style={[styles.sheet, { backgroundColor: theme.colors.surface }]}
          >
            <Text
              style={[
                theme.typography.title.sm,
                {
                  color: theme.colors.text,
                  marginBottom: theme.spacing.md,
                },
              ]}
            >
              {label ?? 'Select month'}
            </Text>
            <FlatList
              data={months}
              keyExtractor={(p) => p}
              keyboardShouldPersistTaps="handled"
              initialScrollIndex={initialIndex}
              getItemLayout={(_, index) => ({
                length: PERIOD_ITEM_HEIGHT,
                offset: PERIOD_ITEM_HEIGHT * index,
                index,
              })}
              renderItem={({ item }) => {
                const isSelected = item === value;
                return (
                  <Pressable
                    onPress={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    style={({ pressed }) => [
                      styles.monthItem,
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
                      {formatDateFns(parseISO(`${item}-01`), 'MMMM yyyy')}
                    </Text>
                  </Pressable>
                );
              }}
            />
            <Pressable
              onPress={() => setOpen(false)}
              hitSlop={8}
              style={styles.cancelRow}
              accessibilityRole="button"
            >
              <Text
                style={[
                  theme.typography.body.sm,
                  { color: theme.colors.accent },
                ]}
              >
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {helper ? (
        <Text
          style={[
            theme.typography.label.sm,
            styles.helperText,
            { color: theme.colors.textMuted },
          ]}
        >
          {helper}
        </Text>
      ) : null}
      {error ? (
        <Text
          style={[
            theme.typography.label.sm,
            styles.errorText,
            { color: theme.colors.danger },
          ]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Time input (HH:MM 24-hour) ──────────────────────────────────────────────

export interface TimeInputProps {
  /** HH:MM 24-hour. */
  value: string;
  onChange: (next: string) => void;
  label?: string;
  error?: string | null;
  disabled?: boolean;
}

export function TimeInput({
  value,
  onChange,
  label,
  error,
  disabled,
}: TimeInputProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [open, setOpen] = useState(false);

  const date = parseSafeHm(value) ?? new Date();
  const display = (() => {
    const parsed = parseSafeHm(value);
    if (!parsed) return value || '—';
    // Display in 24-hour HH:mm to match the storage format unambiguously.
    return formatDateFns(parsed, 'HH:mm');
  })();

  function handleChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      setOpen(false);
      if (event.type === 'dismissed') return;
    }
    if (!selected) return;
    onChange(formatDateFns(selected, 'HH:mm'));
  }

  return (
    <View>
      {label ? (
        <Text style={[theme.typography.label.md, styles.label]}>{label}</Text>
      ) : null}
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${display}` : display}
        style={[
          styles.field,
          {
            borderColor: error ? theme.colors.danger : theme.colors.border,
            opacity: disabled ? theme.opacity.disabled : 1,
          },
        ]}
      >
        <Text style={[theme.typography.body.md, { color: theme.colors.text }]}>
          {display}
        </Text>
      </Pressable>

      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          value={date}
          mode="time"
          is24Hour
          display="default"
          onChange={handleChange}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <IosPickerModal visible={open} onDone={() => setOpen(false)}>
          <DateTimePicker
            value={date}
            mode="time"
            is24Hour
            display="spinner"
            // See DateInput for why we bind themeVariant to theme.mode.
            themeVariant={theme.mode}
            textColor={theme.colors.text}
            onChange={handleChange}
          />
        </IosPickerModal>
      ) : null}

      {error ? (
        <Text
          style={[
            theme.typography.label.sm,
            styles.errorText,
            { color: theme.colors.danger },
          ]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSafeYmd(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = parseISO(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseSafePeriod(s: string): Date | null {
  if (!/^\d{4}-\d{2}$/.test(s)) return null;
  const d = parseISO(`${s}-01`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseSafeHm(s: string): Date | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return null;
  const [hh, mm] = s.split(':').map((x) => Number(x));
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d;
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
    helperText: {
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
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.lg,
      paddingTop: theme.spacing.md,
    },
    doneRow: {
      paddingTop: theme.spacing.md,
      alignSelf: 'flex-end',
    },
    monthItem: {
      height: 48,
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.md,
      borderBottomWidth: theme.borderWidth.hairline,
    },
    cancelRow: {
      paddingTop: theme.spacing.md,
      alignItems: 'center',
    },
  });
}

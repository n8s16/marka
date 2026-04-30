// Tap-to-edit date input.
//
// Uses @react-native-community/datetimepicker (pinned 8.4.4 — Expo SDK 54
// compatible). The picker is presented per-platform:
//   - iOS: spinner inside an inline modal-ish dropdown when toggled.
//   - Android: native dialog opened on demand.
//
// We render a labeled tappable surface that displays the current value as
// a friendly formatted string (e.g. "Apr 29, 2026"). The picker only mounts
// when expanded, so first-paint cost is just a Pressable.
//
// All wire-protocol values are ISO `YYYY-MM-DD` strings — that's what the
// data layer stores. date-fns parses/formats both directions.

import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { format as formatDateFns, parseISO } from 'date-fns';

import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

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
    // Android closes the dialog on its own; iOS inline mode stays open.
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'dismissed') return;
    if (!selected) return;
    onChange(formatDateFns(selected, 'yyyy-MM-dd'));
  }

  return (
    <View>
      {label ? <Text style={[theme.typography.label.md, styles.label]}>{label}</Text> : null}
      <Pressable
        onPress={() => !disabled && setOpen((o) => !o)}
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
        <Text style={[theme.typography.body.md, { color: theme.colors.text }]}>{display}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
        />
      ) : null}
      {error ? (
        <Text style={[theme.typography.label.sm, styles.errorText, { color: theme.colors.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Period input (YYYY-MM) ──────────────────────────────────────────────────

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

  const date = parseSafePeriod(value) ?? new Date();
  const display = (() => {
    const parsed = parseSafePeriod(value);
    if (!parsed) return value || '—';
    return formatDateFns(parsed, 'MMMM yyyy');
  })();

  function handleChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'dismissed') return;
    if (!selected) return;
    // Force day=1 then format YYYY-MM. The datetimepicker exposes a date,
    // not a year-month; we drop the day portion.
    const period = formatDateFns(selected, 'yyyy-MM');
    onChange(period);
  }

  return (
    <View>
      {label ? <Text style={[theme.typography.label.md, styles.label]}>{label}</Text> : null}
      <Pressable
        onPress={() => !disabled && setOpen((o) => !o)}
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
        <Text style={[theme.typography.body.md, { color: theme.colors.text }]}>{display}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
        />
      ) : null}
      {helper ? (
        <Text
          style={[theme.typography.label.sm, styles.helperText, { color: theme.colors.textMuted }]}
        >
          {helper}
        </Text>
      ) : null}
      {error ? (
        <Text style={[theme.typography.label.sm, styles.errorText, { color: theme.colors.danger }]}>
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

export function TimeInput({ value, onChange, label, error, disabled }: TimeInputProps) {
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
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'dismissed') return;
    if (!selected) return;
    onChange(formatDateFns(selected, 'HH:mm'));
  }

  return (
    <View>
      {label ? <Text style={[theme.typography.label.md, styles.label]}>{label}</Text> : null}
      <Pressable
        onPress={() => !disabled && setOpen((o) => !o)}
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
        <Text style={[theme.typography.body.md, { color: theme.colors.text }]}>{display}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={date}
          mode="time"
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
        />
      ) : null}
      {error ? (
        <Text style={[theme.typography.label.sm, styles.errorText, { color: theme.colors.danger }]}>
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
  });
}

// Date and time inputs, web/PWA edition.
//
// Uses native HTML5 `<input type="date">` and `<input type="time">`. The
// browser provides the picker UI for free:
//   - iOS Safari renders the native wheel scroller.
//   - Android Chrome opens the system date dialog.
//   - Desktop browsers render a calendar dropdown.
//
// Default browser behaviour only opens the picker when the user clicks
// the tiny calendar / clock icon at the right edge of the field — clicking
// the rest of the input just focuses it. We override that by calling
// `input.showPicker()` on click and focus, so the whole field is the
// affordance. `showPicker()` is supported in Chrome 99+, Edge 99+,
// Firefox 101+, and Safari 16+. We try/catch because the call can throw
// in obscure environments (e.g. cross-origin iframes), and the fallback
// is just the default icon-only behaviour.
//
// Wire-protocol formats are unchanged from the previous native build:
//   - DateInput value: ISO `YYYY-MM-DD`
//   - TimeInput value: 24h `HH:mm`
// Both happen to match the HTML5 input's native value format, so no
// translation is needed.
//
// Period (`YYYY-MM`) selection is a separate component: `period-picker.tsx`.

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

// ─── Date input ──────────────────────────────────────────────────────────────

export interface DateInputProps {
  /** ISO `YYYY-MM-DD`. */
  value: string;
  onChange: (next: string) => void;
  label?: string;
  error?: string | null;
  disabled?: boolean;
  /** Accepted for API compatibility; ignored on web (browser owns display). */
  displayFormat?: string;
}

export function DateInput({
  value,
  onChange,
  label,
  error,
  disabled,
}: DateInputProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View>
      {label ? (
        <Text style={[theme.typography.label.md, styles.label]}>{label}</Text>
      ) : null}
      <input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.value)}
        onClick={openPicker}
        onFocus={openPicker}
        aria-label={label}
        style={inputStyle({
          theme,
          hasError: !!error,
          disabled: !!disabled,
        })}
      />
      {error ? (
        <Text style={[theme.typography.label.sm, styles.errorText, { color: theme.colors.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Time input ──────────────────────────────────────────────────────────────

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

  return (
    <View>
      {label ? (
        <Text style={[theme.typography.label.md, styles.label]}>{label}</Text>
      ) : null}
      <input
        type="time"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.value)}
        onClick={openPicker}
        onFocus={openPicker}
        aria-label={label}
        style={inputStyle({
          theme,
          hasError: !!error,
          disabled: !!disabled,
        })}
      />
      {error ? (
        <Text style={[theme.typography.label.sm, styles.errorText, { color: theme.colors.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Open the native picker on click / focus instead of waiting for the
// user to find the small icon at the right edge of the field. The
// `showPicker` API is widely available; the try/catch shields us from
// rare environments (e.g. cross-origin iframes) where it throws.
function openPicker(
  e: React.SyntheticEvent<HTMLInputElement>,
): void {
  const el = e.currentTarget;
  if (typeof el.showPicker !== 'function') return;
  try {
    el.showPicker();
  } catch {
    // Swallow — fallback is the default icon-only behaviour.
  }
}

// ─── Shared styles ───────────────────────────────────────────────────────────

interface InputStyleArgs {
  theme: Theme;
  hasError: boolean;
  disabled: boolean;
}

// Same stack react-native-web applies to <Text>. Hardcoded here because
// RN-Web doesn't propagate it to bare HTML elements like <input>, and
// `inherit` resolves against <body> which has no font-family set.
const RN_WEB_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function inputStyle({ theme, hasError, disabled }: InputStyleArgs): React.CSSProperties {
  return {
    fontFamily: RN_WEB_FONT_STACK,
    fontSize: theme.typography.body.md.fontSize,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    border: `${theme.borderWidth.hairline}px solid ${
      hasError ? theme.colors.danger : theme.colors.border
    }`,
    borderRadius: theme.radii.sm,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.md,
    width: '100%',
    boxSizing: 'border-box',
    opacity: disabled ? theme.opacity.disabled : 1,
  };
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    label: {
      color: theme.colors.textMuted,
      marginBottom: theme.spacing.xs,
    },
    errorText: {
      marginTop: theme.spacing.xs,
    },
  });
}

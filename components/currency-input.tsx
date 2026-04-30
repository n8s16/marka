// Controlled currency input.
//
// Storage rule (DATA_MODEL.md): currency is integer minor units (centavos).
// This input is the single funnel from a user's typed string into that
// integer. Display formatting belongs to formatCurrency at the read path;
// here we only parse.
//
// Behaviour:
//   - Keyboard: decimal-pad (per CLAUDE.md, all currency entry).
//   - Renders a static "₱" prefix to the left of the editable field — the
//     prefix is NOT part of the editable text, so users can't accidentally
//     erase or duplicate it.
//   - On every keystroke, parses with parseCurrencyInput. On parse success,
//     emits the centavo value upward; on parse failure, emits null and shows
//     the failure reason as an inline error label.
//   - Empty string → emits null, no error label (the parent decides whether
//     to require a value at submit time).
//   - On blur, if the current value is valid, the displayed text is rewritten
//     to a clean two-decimal form ("1599" → "1599.00"). Mid-typing
//     reformatting is deliberately not done — it fights the user's caret.
//
// The parent owns the canonical centavo value via the controlled `value`
// prop; this component owns the display string. When `value` changes from
// outside (e.g. resetting a form), we re-derive the display string IF the
// current display string would parse to a different value. That keeps user
// edits sticky while still honouring controlled-input semantics.

import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { parseCurrencyInput } from '@/logic/currency';
import { useTheme } from '@/state/theme';

export interface CurrencyInputProps {
  /** Current centavo value, or null when no valid value is set. */
  value: number | null;
  /** Called on every keystroke. `raw` is the literal text the user has typed. */
  onChange: (value: number | null, raw: string) => void;
  /** Optional label (rendered above the field). */
  label?: string;
  /** Placeholder shown inside the input when empty. */
  placeholder?: string;
  /** Override accessibility label; falls back to `label` when omitted. */
  accessibilityLabel?: string;
  /** Disabled state; renders dimmed and ignores edits. */
  disabled?: boolean;
  /** Optional submit-time error from the parent (overrides parse error). */
  error?: string | null;
  /** Auto-focus on mount. */
  autoFocus?: boolean;
}

/** Format a centavo value as the editable text "1599.00" (no peso sign, no commas). */
function centavosToEditableText(centavos: number): string {
  const abs = Math.abs(Math.trunc(Math.round(centavos)));
  const pesos = Math.trunc(abs / 100);
  const cents = abs % 100;
  return `${pesos}.${cents.toString().padStart(2, '0')}`;
}

export function CurrencyInput({
  value,
  onChange,
  label,
  placeholder,
  accessibilityLabel,
  disabled,
  error,
  autoFocus,
}: CurrencyInputProps) {
  const theme = useTheme();

  const [text, setText] = useState<string>(() =>
    value === null || value === undefined ? '' : centavosToEditableText(value),
  );
  const [parseError, setParseError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  // Re-sync the display when the parent pushes a new `value` that doesn't
  // match what the field currently represents. Without this, calling
  // `setValue(null)` from a parent (e.g. form reset) wouldn't clear the
  // field. We compare via parse so trailing zeros / partial typing don't
  // trigger spurious resets.
  const lastEmittedValue = useRef<number | null>(value);
  useEffect(() => {
    if (value === lastEmittedValue.current) return;
    lastEmittedValue.current = value;
    if (value === null || value === undefined) {
      setText('');
      setParseError(null);
      return;
    }
    setText(centavosToEditableText(value));
    setParseError(null);
  }, [value]);

  const styles = useMemo(() => makeStyles(theme), [theme]);

  function handleChangeText(next: string) {
    setText(next);

    if (next.trim() === '') {
      setParseError(null);
      lastEmittedValue.current = null;
      onChange(null, next);
      return;
    }

    const result = parseCurrencyInput(next);
    if (result.ok) {
      setParseError(null);
      lastEmittedValue.current = result.value;
      onChange(result.value, next);
    } else {
      setParseError(result.reason);
      lastEmittedValue.current = null;
      onChange(null, next);
    }
  }

  function handleBlur() {
    setFocused(false);
    // Reformat to clean two-decimal form on blur if the current text parses.
    // Mid-typing reformat is deliberately omitted — it fights the user's caret.
    const trimmed = text.trim();
    if (trimmed === '') return;
    const result = parseCurrencyInput(trimmed);
    if (result.ok) {
      const clean = centavosToEditableText(result.value);
      if (clean !== trimmed) setText(clean);
    }
  }

  const showError = error ?? parseError;
  const borderColor = showError
    ? theme.colors.danger
    : focused
      ? theme.colors.borderStrong
      : theme.colors.border;

  return (
    <View>
      {label ? (
        <Text style={[theme.typography.label.md, styles.label]}>{label}</Text>
      ) : null}
      <View style={[styles.row, { borderColor, opacity: disabled ? theme.opacity.disabled : 1 }]}>
        <Text style={[theme.typography.body.md, styles.prefix]} accessibilityElementsHidden>
          ₱
        </Text>
        <TextInput
          value={text}
          onChangeText={handleChangeText}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          editable={!disabled}
          keyboardType="decimal-pad"
          placeholder={placeholder ?? '0.00'}
          placeholderTextColor={theme.colors.textFaint}
          accessibilityLabel={accessibilityLabel ?? label ?? 'Amount'}
          autoFocus={autoFocus}
          hitSlop={8}
          style={[
            theme.typography.body.md,
            styles.input,
            { color: theme.colors.text },
          ]}
        />
      </View>
      {showError ? (
        <Text style={[theme.typography.label.sm, styles.errorText, { color: theme.colors.danger }]}>
          {showError}
        </Text>
      ) : null}
    </View>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    label: {
      color: theme.colors.textMuted,
      marginBottom: theme.spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: theme.borderWidth.hairline,
      borderRadius: theme.radii.sm,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
    },
    prefix: {
      color: theme.colors.textMuted,
      marginRight: theme.spacing.xs,
    },
    input: {
      flex: 1,
      padding: 0,
      margin: 0,
    },
    errorText: {
      marginTop: theme.spacing.xs,
    },
  });
}

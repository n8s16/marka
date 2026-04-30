// Simple labeled <TextInput> wrapper.
//
// Centralises label + field + error layout so individual forms stay short.
// For currency, dates, periods, times, wallets, and frequency, use the
// dedicated components — those carry parse / picker behaviour. This file is
// for plain text and number entry (bill name, due-day, interval, reminder
// offset days, optional notes).

import { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helper?: string;
  error?: string | null;
  multiline?: boolean;
}

export function TextField({
  label,
  helper,
  error,
  multiline,
  ...inputProps
}: TextFieldProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View>
      {label ? <Text style={[theme.typography.label.md, styles.label]}>{label}</Text> : null}
      <TextInput
        {...inputProps}
        multiline={multiline}
        placeholderTextColor={theme.colors.textFaint}
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        style={[
          theme.typography.body.md,
          styles.input,
          {
            color: theme.colors.text,
            borderColor: error ? theme.colors.danger : theme.colors.border,
            minHeight: multiline ? 80 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
      />
      {helper && !error ? (
        <Text
          style={[theme.typography.label.sm, styles.helperText, { color: theme.colors.textMuted }]}
        >
          {helper}
        </Text>
      ) : null}
      {error ? (
        <Text style={[theme.typography.label.sm, styles.helperText, { color: theme.colors.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    label: {
      color: theme.colors.textMuted,
      marginBottom: theme.spacing.xs,
    },
    input: {
      borderWidth: theme.borderWidth.hairline,
      borderRadius: theme.radii.sm,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.md,
    },
    helperText: {
      marginTop: theme.spacing.xs,
    },
  });
}

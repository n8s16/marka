// Reusable segmented chip selector — used for frequency picker on the bill
// form, and a candidate for any small enum picker (e.g. wallet type later).
//
// Distinct from <WalletPicker>: chips here use theme.colors.accent for active
// state because they aren't wallet-identity-bearing. WalletPicker uses brand
// colors because wallets ARE identity.

import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

export interface SegmentedChipsProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
  label?: string;
  error?: string | null;
}

export function SegmentedChips<T extends string>({
  options,
  value,
  onChange,
  label,
  error,
}: SegmentedChipsProps<T>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View>
      {label ? <Text style={[theme.typography.label.md, styles.label]}>{label}</Text> : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              hitSlop={6}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? theme.colors.accent : 'transparent',
                  borderColor: active ? theme.colors.accent : theme.colors.border,
                },
              ]}
            >
              <Text
                style={[
                  theme.typography.body.sm,
                  {
                    color: active ? theme.colors.bg : theme.colors.text,
                    fontWeight: active
                      ? theme.typography.weights.medium
                      : theme.typography.weights.regular,
                  },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {error ? (
        <Text style={[theme.typography.label.sm, styles.errorText, { color: theme.colors.danger }]}>
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
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    chip: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radii.round,
      borderWidth: theme.borderWidth.hairline,
    },
    errorText: {
      marginTop: theme.spacing.xs,
    },
  });
}

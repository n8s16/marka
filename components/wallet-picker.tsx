// Horizontal scrollable wallet chip picker.
//
// Renders one chip per wallet with the wallet's brand color tint as the
// active background (low alpha so the wallet name remains legible against
// it). Inactive chips are hairline-bordered and unfilled so the active state
// is visually distinct without relying on a non-brand accent color.
//
// Brand colors (theme.walletBrand[key]) are constant across light and dark
// themes; for custom user wallets we fall through to the wallet's stored
// hex `color` via the shared accentColorFor helper.

import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Wallet } from '@/db/queries/wallets';
import { useTheme } from '@/state/theme';
import { accentColorFor } from '@/utils/wallet-color';
import type { Theme } from '@/styles/theme';

export interface WalletPickerProps {
  wallets: Wallet[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Optional label rendered above the row of chips. */
  label?: string;
  /** Optional submit-time error message. */
  error?: string | null;
}

/**
 * Apply a low alpha (~0.15) to a hex color. Accepts `#RRGGBB` only — that's
 * what the wallet brand palette and user-input color picker emit; non-hex
 * inputs fall through unchanged so we never silently corrupt them.
 */
function hexWithAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const a = Math.max(0, Math.min(1, alpha));
  const aHex = Math.round(a * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${aHex}`;
}

export function WalletPicker({
  wallets,
  selectedId,
  onSelect,
  label,
  error,
}: WalletPickerProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View>
      {label ? (
        <Text style={[theme.typography.label.md, styles.label]}>{label}</Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {wallets.map((w) => {
          const accent = accentColorFor(w) ?? theme.walletBrand.fallback;
          const active = w.id === selectedId;
          const bg = active ? hexWithAlpha(accent, 0.15) : 'transparent';
          const borderColor = active ? accent : theme.colors.border;
          return (
            <Pressable
              key={w.id}
              onPress={() => onSelect(w.id)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${w.name}${active ? ', selected' : ''}`}
              style={[
                styles.chip,
                {
                  backgroundColor: bg,
                  borderColor,
                  borderWidth: active ? 1.5 : theme.borderWidth.hairline,
                },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: accent }]} />
              <Text
                style={[
                  theme.typography.body.sm,
                  {
                    color: theme.colors.text,
                    fontWeight: active
                      ? theme.typography.weights.medium
                      : theme.typography.weights.regular,
                  },
                ]}
                numberOfLines={1}
              >
                {w.name}
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
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radii.round,
      gap: theme.spacing.xs,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    errorText: {
      marginTop: theme.spacing.xs,
    },
  });
}

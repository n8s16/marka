// Inline color picker — horizontally-scrollable swatches.
//
// Used by the wallet add/edit form to pick a wallet's brand-style color.
// No modal: the swatches render inline in the form, similar to how
// WalletPicker shows wallet chips. Two groups, both inside the same
// horizontal ScrollView so the user can flick through them naturally:
//
//   1. Brand — the four canonical PH wallet brand colors (Maya, GCash,
//      UnionBank, Cash). These match `styles/tokens.ts walletBrand` so
//      adding a wallet with the same color as a known brand gets the
//      same visual identity.
//   2. Custom palette — a curated set of 12 visually-distinct hexes for
//      user wallets that aren't the canonical four. Intentionally limited
//      — no full HSL picker for v1; users can roughly fit any new wallet
//      to one of these. Tweak the palette here, not in callers.
//
// Each swatch is a circular ~32px Pressable. The selected swatch wears a
// thicker accent-colored ring so the user can see what's picked at a
// glance regardless of the swatch's hue.

import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';
import { walletBrand } from '@/styles/tokens';

export interface ColorPickerProps {
  value: string; // hex with '#', e.g. "#00B14F"
  onChange: (next: string) => void;
  label?: string;
  error?: string | null;
  disabled?: boolean;
}

// Brand colors first, in the same order as STARTER_WALLETS so the visual
// hierarchy matches what the user sees during onboarding.
const BRAND_SWATCHES: ReadonlyArray<{ hex: string; name: string }> = [
  { hex: walletBrand.maya, name: 'Maya green' },
  { hex: walletBrand.gcash, name: 'GCash blue' },
  { hex: walletBrand.unionbank, name: 'UnionBank orange' },
  { hex: walletBrand.cash, name: 'Cash gray' },
];

// Curated custom palette — picked to be visually distinct from the four
// brand colors and from each other. Hand-tuned hexes; not generated from a
// formula. If a user's wallet truly doesn't fit any of these, the closest
// one is good enough for v1.
const CUSTOM_SWATCHES: ReadonlyArray<{ hex: string; name: string }> = [
  { hex: '#7B2CBF', name: 'Purple' },
  { hex: '#0FA3B1', name: 'Teal' },
  { hex: '#D81E5B', name: 'Magenta' },
  { hex: '#E85D04', name: 'Deep orange' },
  { hex: '#1A4FA0', name: 'Navy' },
  { hex: '#2D6A4F', name: 'Forest green' },
  { hex: '#C77700', name: 'Gold' },
  { hex: '#475569', name: 'Slate' },
  { hex: '#9A031E', name: 'Crimson' },
  { hex: '#EC8B9C', name: 'Pink' },
  { hex: '#22A39F', name: 'Cyan' },
  { hex: '#7C5E3C', name: 'Brown' },
];

function normalizeHex(hex: string): string {
  return hex.trim().toLowerCase();
}

interface SwatchProps {
  hex: string;
  name: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}

function Swatch({ hex, name, selected, disabled, onPress }: SwatchProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeSwatchStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${name}${selected ? ', selected' : ''}`}
      accessibilityState={{ selected, disabled }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.swatchOuter,
        {
          borderColor: selected ? theme.colors.text : 'transparent',
          opacity: disabled ? theme.opacity.disabled : pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.swatchInner, { backgroundColor: hex }]} />
    </Pressable>
  );
}

export function ColorPicker({
  value,
  onChange,
  label,
  error,
  disabled,
}: ColorPickerProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const normValue = normalizeHex(value);

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
        <View style={styles.group}>
          <Text
            style={[
              theme.typography.label.sm,
              styles.groupLabel,
              { color: theme.colors.textFaint },
            ]}
          >
            Brand
          </Text>
          <View style={styles.swatchRow}>
            {BRAND_SWATCHES.map((s) => (
              <Swatch
                key={s.hex}
                hex={s.hex}
                name={s.name}
                selected={normalizeHex(s.hex) === normValue}
                disabled={!!disabled}
                onPress={() => onChange(s.hex)}
              />
            ))}
          </View>
        </View>

        <View
          style={[
            styles.divider,
            { backgroundColor: theme.colors.border },
          ]}
        />

        <View style={styles.group}>
          <Text
            style={[
              theme.typography.label.sm,
              styles.groupLabel,
              { color: theme.colors.textFaint },
            ]}
          >
            Custom
          </Text>
          <View style={styles.swatchRow}>
            {CUSTOM_SWATCHES.map((s) => (
              <Swatch
                key={s.hex}
                hex={s.hex}
                name={s.name}
                selected={normalizeHex(s.hex) === normValue}
                disabled={!!disabled}
                onPress={() => onChange(s.hex)}
              />
            ))}
          </View>
        </View>
      </ScrollView>

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

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    label: {
      color: theme.colors.textMuted,
      marginBottom: theme.spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: theme.spacing.xs,
      gap: theme.spacing.md,
    },
    group: {
      flexDirection: 'column',
      alignItems: 'flex-start',
    },
    groupLabel: {
      textTransform: 'uppercase',
      marginBottom: theme.spacing.xs,
    },
    swatchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    divider: {
      width: theme.borderWidth.hairline,
      alignSelf: 'stretch',
      marginTop: theme.spacing.lg,
    },
    errorText: {
      marginTop: theme.spacing.xs,
    },
  });
}

function makeSwatchStyles(theme: Theme) {
  return StyleSheet.create({
    // Outer Pressable doubles as the selected-ring container. Border width
    // stays constant so the inner swatch never reflows when (de)selected.
    swatchOuter: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchInner: {
      width: 32,
      height: 32,
      borderRadius: 16,
      // Hairline so very-light swatches don't disappear on a white surface.
      borderWidth: theme.borderWidth.hairline,
      borderColor: theme.colors.border,
    },
  });
}

/** Returns true when `value` is a valid `#RRGGBB` hex string. */
export function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

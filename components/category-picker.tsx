// Horizontal scrollable category chip picker.
//
// Mirrors the shape of `wallet-picker.tsx` so the two read consistently in the
// expense form. Categories are not brand-encoded — there's no per-category
// color in the data model — so the active state uses a plain neutral
// (`theme.colors.surfaceMuted` background, `theme.colors.text` border) instead
// of a wallet-style brand tint. This keeps wallets as the single visual
// vehicle for color identity in the app.

import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Category } from '@/db/queries/categories';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

export interface CategoryPickerProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Optional label rendered above the row of chips. */
  label?: string;
  /** Optional submit-time error message. */
  error?: string | null;
  /** Disabled state; renders dimmed and ignores edits. */
  disabled?: boolean;
}

export function CategoryPicker({
  categories,
  selectedId,
  onSelect,
  label,
  error,
  disabled,
}: CategoryPickerProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={{ opacity: disabled ? theme.opacity.disabled : 1 }}>
      {label ? (
        <Text style={[theme.typography.label.md, styles.label]}>{label}</Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {categories.map((c) => {
          const active = c.id === selectedId;
          const bg = active ? theme.colors.surfaceMuted : 'transparent';
          const borderColor = active
            ? theme.colors.text
            : theme.colors.border;
          return (
            <Pressable
              key={c.id}
              onPress={() => !disabled && onSelect(c.id)}
              disabled={disabled}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: !!disabled }}
              accessibilityLabel={`${c.name}${active ? ', selected' : ''}`}
              style={[
                styles.chip,
                {
                  backgroundColor: bg,
                  borderColor,
                  borderWidth: active ? 1.5 : theme.borderWidth.hairline,
                },
              ]}
            >
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
                {c.name}
              </Text>
            </Pressable>
          );
        })}
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
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    chip: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radii.round,
    },
    errorText: {
      marginTop: theme.spacing.xs,
    },
  });
}

// Year switcher — `‹ 2026 ›` control at the top of the year view.
//
// Arrows fade on boundaries (no `‹` if there's no earlier year with data;
// no `›` once we've reached the current calendar year). Faded arrows stay
// visible but are non-interactive so the symmetry isn't broken.

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

export interface YearSwitcherProps {
  year: number;
  /** When false, the back arrow is faded and disabled. */
  canGoBack: boolean;
  /** When false, the forward arrow is faded and disabled. */
  canGoForward: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export function YearSwitcher({
  year,
  canGoBack,
  canGoForward,
  onPrev,
  onNext,
}: YearSwitcherProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPrev}
        disabled={!canGoBack}
        accessibilityRole="button"
        accessibilityLabel="Previous year"
        accessibilityState={{ disabled: !canGoBack }}
        hitSlop={12}
        style={({ pressed }) => [
          styles.arrow,
          {
            opacity: !canGoBack
              ? theme.opacity.disabled
              : pressed
                ? theme.opacity.muted
                : 1,
          },
        ]}
      >
        <Ionicons
          name="chevron-back"
          size={20}
          color={theme.colors.text}
        />
      </Pressable>

      <Text
        style={[
          theme.typography.title.md,
          { color: theme.colors.text },
        ]}
      >
        {year}
      </Text>

      <Pressable
        onPress={onNext}
        disabled={!canGoForward}
        accessibilityRole="button"
        accessibilityLabel="Next year"
        accessibilityState={{ disabled: !canGoForward }}
        hitSlop={12}
        style={({ pressed }) => [
          styles.arrow,
          {
            opacity: !canGoForward
              ? theme.opacity.disabled
              : pressed
                ? theme.opacity.muted
                : 1,
          },
        ]}
      >
        <Ionicons
          name="chevron-forward"
          size={20}
          color={theme.colors.text}
        />
      </Pressable>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.lg,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
    },
    arrow: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

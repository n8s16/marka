// Theme picker screen.
//
// Route: `/settings/theme`. Reachable from the Settings hub's "Theme" row.
// PRD §"Behavior decisions" — Theme: defaults to System; Light/Dark/System
// are the three options; mid-session system day/night switch reflects
// immediately when System is selected.
//
// Layout follows the page-style convention used by other Settings sub-screens
// (see `app/settings/wallets/[id].tsx`): SafeAreaView root, header with Back
// link + centered title, body of hairline-bordered card containing tappable
// rows. No save button — selection commits on tap, same UX as iOS Settings.
//
// The active row uses the theme's `accent` color for its checkmark indicator.
// We use a checkmark glyph (✓) rather than "Selected" text because at-a-glance
// scannability matters more than verbosity here, and the row label already
// names the option.

import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import {
  setThemeMode,
  useTheme,
  useThemeMode,
  type ThemeMode,
} from '@/state/theme';
import type { Theme } from '@/styles/theme';

interface ThemeOption {
  value: ThemeMode;
  label: string;
}

const OPTIONS: ReadonlyArray<ThemeOption> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export default function ThemePickerScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const router = useRouter();
  const mode = useThemeMode();

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
          >
            <Text
              style={[
                theme.typography.body.sm,
                { color: theme.colors.accent },
              ]}
            >
              Back
            </Text>
          </Pressable>
          <Text
            style={[theme.typography.title.md, { color: theme.colors.text }]}
          >
            Theme
          </Text>
          {/* Spacer so the title centers visually opposite the Back link. */}
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            {OPTIONS.map((opt, index) => {
              const isLast = index === OPTIONS.length - 1;
              const isActive = opt.value === mode;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setThemeMode(opt.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={
                    isActive ? `${opt.label}, selected` : opt.label
                  }
                  style={({ pressed }) => [
                    styles.row,
                    !isLast && {
                      borderBottomWidth: theme.borderWidth.hairline,
                      borderBottomColor: theme.colors.border,
                    },
                    pressed && {
                      backgroundColor: theme.colors.surfaceMuted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      theme.typography.body.md,
                      { color: theme.colors.text },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {isActive ? (
                    <Text
                      style={[
                        theme.typography.body.md,
                        {
                          color: theme.colors.accent,
                          fontWeight: theme.typography.weights.medium,
                        },
                      ]}
                    >
                      ✓
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <Text
            style={[
              theme.typography.body.sm,
              styles.helperText,
              { color: theme.colors.textMuted },
            ]}
          >
            System follows your device&apos;s appearance setting and updates
            automatically when it changes. Light and Dark override the system.
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.bg },
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.md,
    },
    headerSpacer: { width: 36 },
    scrollContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.xxxl,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      borderColor: theme.colors.border,
      borderWidth: theme.borderWidth.hairline,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
    },
    helperText: {
      marginTop: theme.spacing.md,
      paddingHorizontal: theme.spacing.xs,
    },
  });
}

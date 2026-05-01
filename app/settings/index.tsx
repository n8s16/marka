// Settings hub screen.
//
// Route: `/settings`. Reachable from the Wallets tab "Settings" header link.
// Per docs/PRD.md §"Supporting screens" — Settings, this is the parent
// screen for manage-wallets, manage-bills, categories, theme, app lock,
// notifications, export, and backup status. PR 10a wired Wallets; PR 10b
// wired Bills and Categories; PR 10c wired Theme; PR 10d wires App lock.
// The remaining row (Export) still renders as disabled "Coming soon" so
// the shell of the Settings hub is in place for PR 10e to drop into
// without restructuring.
//
// Layout mirrors `app/transfers/index.tsx`: SafeAreaView root, header
// with Back link + centered title, ScrollView body. No FAB — Settings
// has no primary creation action.
//
// Each category is a tappable row inside a hairline-bordered card. The
// disabled rows use `Pressable` with `disabled` so VoiceOver announces
// them as unavailable rather than as silent text.

import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';

import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

interface SettingsRow {
  key: string;
  title: string;
  subtitle: string;
  href: Href | null; // null → Coming soon (disabled).
}

const ROWS: ReadonlyArray<SettingsRow> = [
  {
    key: 'wallets',
    title: 'Wallets',
    subtitle: 'Add or archive wallets, change colors',
    href: '/settings/wallets',
  },
  {
    key: 'bills',
    title: 'Bills',
    subtitle: 'Edit, archive, or unarchive any bill',
    href: '/settings/bills',
  },
  {
    key: 'categories',
    title: 'Categories',
    subtitle: 'Add, rename, or archive expense categories',
    href: '/settings/categories',
  },
  {
    key: 'theme',
    title: 'Theme',
    subtitle: 'Light, Dark, or System',
    href: '/settings/theme',
  },
  {
    key: 'app-lock',
    title: 'App lock',
    subtitle: 'Require biometric unlock to open the app',
    href: '/settings/app-lock',
  },
  {
    key: 'export',
    title: 'Export',
    subtitle: 'Save your data as JSON or CSV',
    href: null,
  },
];

export default function SettingsHubScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const router = useRouter();

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
            Settings
          </Text>
          {/* Spacer so the title centers visually opposite the Back link. */}
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            {ROWS.map((row, index) => {
              const isLast = index === ROWS.length - 1;
              const disabled = row.href === null;
              return (
                <Pressable
                  key={row.key}
                  onPress={() => {
                    if (row.href) router.push(row.href);
                  }}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityState={{ disabled }}
                  accessibilityLabel={
                    disabled ? `${row.title}, coming soon` : row.title
                  }
                  style={({ pressed }) => [
                    styles.row,
                    !isLast && {
                      borderBottomWidth: theme.borderWidth.hairline,
                      borderBottomColor: theme.colors.border,
                    },
                    pressed && !disabled && {
                      backgroundColor: theme.colors.surfaceMuted,
                    },
                  ]}
                >
                  <View style={styles.rowText}>
                    <Text
                      style={[
                        theme.typography.body.md,
                        {
                          color: disabled
                            ? theme.colors.textMuted
                            : theme.colors.text,
                        },
                      ]}
                    >
                      {row.title}
                    </Text>
                    <Text
                      style={[
                        theme.typography.label.sm,
                        {
                          color: theme.colors.textMuted,
                          marginTop: 2,
                        },
                      ]}
                    >
                      {disabled ? 'Coming soon' : row.subtitle}
                    </Text>
                  </View>
                  {!disabled ? (
                    <Text
                      style={[
                        theme.typography.body.sm,
                        { color: theme.colors.textFaint },
                      ]}
                    >
                      ›
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
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
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      gap: theme.spacing.md,
    },
    rowText: {
      flex: 1,
    },
  });
}

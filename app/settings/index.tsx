// Settings hub screen.
//
// Route: `/settings`. Reachable from the Wallets tab "Settings" header link.
// Per docs/PRD.md §"Supporting screens" — Settings, this is the parent
// screen for manage-wallets, manage-bills, categories, theme, app lock,
// export, and reset.
//
// Layout mirrors `app/transfers/index.tsx`: SafeAreaView root, header
// with Back link + centered title, ScrollView body. No FAB — Settings
// has no primary creation action. Each row is a tappable Pressable
// inside a hairline-bordered card.

import { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';

import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

interface SettingsRow {
  key: string;
  title: string;
  subtitle: string;
  href: Href;
  /** Tint the title in `colors.danger` to flag a destructive entry. */
  destructive?: boolean;
  /** Hide the row on web — used for native-only features like biometric app lock. */
  nativeOnly?: boolean;
}

const ALL_ROWS: ReadonlyArray<SettingsRow> = [
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
    nativeOnly: true,
  },
  {
    key: 'export',
    title: 'Export',
    subtitle: 'Save your data to JSON or CSV files.',
    href: '/settings/export',
  },
  {
    key: 'reset',
    title: 'Reset',
    subtitle: 'Wipe all wallets, bills, and history. Cannot be undone.',
    href: '/settings/reset',
    destructive: true,
  },
];

// Web bundle hides nativeOnly rows. App lock is the only one today —
// it depends on expo-local-authentication, which has no PWA equivalent.
const ROWS = ALL_ROWS.filter(
  (row) => !(Platform.OS === 'web' && row.nativeOnly),
);

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
              return (
                <Pressable
                  key={row.key}
                  onPress={() => router.push(row.href)}
                  accessibilityRole="button"
                  accessibilityLabel={row.title}
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
                  <View style={styles.rowText}>
                    <Text
                      style={[
                        theme.typography.body.md,
                        {
                          color: row.destructive
                            ? theme.colors.danger
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
                      {row.subtitle}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={theme.colors.textFaint}
                  />
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

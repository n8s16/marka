// Manage categories list screen.
//
// Route: `/settings/categories`. Reachable from the Settings hub.
// Per docs/PRD.md §"Supporting screens" — Settings (categories), this
// screen lists all expense categories (active + archived) with edit-on-tap
// and a FAB to add a new one.
//
// Layout mirrors `app/settings/wallets/index.tsx` and
// `app/settings/bills/index.tsx`. Categories are simpler than wallets and
// bills — no color, no type, no amount — so each row is just the name
// with a small chevron on the right. We keep the chevron (rather than a
// fully empty trailing slot) because it signals "tap to edit" the same
// way the wallet rows do, and the row would otherwise feel sparse.
//
// Sort: `listCategories` already returns rows by `sort_order` ascending
// then `created_at` ascending. We do NOT re-sort by name — users may
// have explicit ordering preferences (the 8 starter categories seed with
// intentional sort_order 0–7).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { useDb } from '@/db/client';
import { listCategories, type Category } from '@/db/queries/categories';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

interface CategoryRowProps {
  category: Category;
  onPress: (id: string) => void;
  isLast: boolean;
}

function CategoryRow({ category, onPress, isLast }: CategoryRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeRowStyles(theme), [theme]);

  return (
    <Pressable
      onPress={() => onPress(category.id)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${category.name}`}
      style={({ pressed }) => [
        styles.row,
        !isLast && {
          borderBottomWidth: theme.borderWidth.hairline,
          borderBottomColor: theme.colors.border,
        },
        pressed && { backgroundColor: theme.colors.surfaceMuted },
      ]}
    >
      <View style={styles.rowText}>
        <Text
          style={[theme.typography.body.md, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          {category.name}
        </Text>
      </View>
      <Text
        style={[theme.typography.body.sm, { color: theme.colors.textFaint }]}
      >
        ›
      </Text>
    </Pressable>
  );
}

export default function ManageCategoriesScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listCategories(db, { includeArchived: true })
      .then((rows) => {
        if (!cancelled) {
          setCategories(rows);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [db]);

  // Reload on focus so changes from the edit screen reflect when returning
  // here. The category table is small (8 starters + user adds) — no
  // caching layer needed at this scale.
  useFocusEffect(
    useCallback(() => {
      const cleanup = load();
      return cleanup;
    }, [load]),
  );

  // Initial mount load (covers first navigation).
  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  const { active, archived } = useMemo(() => {
    // Preserve listCategories' returned order (sort_order asc, created_at
    // asc). Partition only — do not re-sort.
    const a: Category[] = [];
    const ar: Category[] = [];
    for (const c of categories) {
      if (c.archived) ar.push(c);
      else a.push(c);
    }
    return { active: a, archived: ar };
  }, [categories]);

  function handleRowPress(id: string) {
    router.push({
      pathname: '/settings/categories/[id]',
      params: { id },
    });
  }

  function handleAdd() {
    router.push({
      pathname: '/settings/categories/[id]',
      params: { id: 'new' },
    });
  }

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
            Categories
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.text} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text
              style={[
                theme.typography.body.sm,
                { color: theme.colors.danger, textAlign: 'center' },
              ]}
            >
              Failed to load categories: {error.message}
            </Text>
          </View>
        ) : categories.length === 0 ? (
          <View style={styles.empty}>
            <Text
              style={[
                theme.typography.body.md,
                { color: theme.colors.textMuted, textAlign: 'center' },
              ]}
            >
              No categories yet — tap + to add one.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {active.length > 0 ? (
              <View style={styles.section}>
                <Text
                  style={[
                    theme.typography.label.md,
                    styles.sectionHeader,
                    { color: theme.colors.textFaint },
                  ]}
                >
                  Active
                </Text>
                <View style={styles.card}>
                  {active.map((c, i) => (
                    <CategoryRow
                      key={c.id}
                      category={c}
                      onPress={handleRowPress}
                      isLast={i === active.length - 1}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {archived.length > 0 ? (
              <View style={styles.section}>
                <Text
                  style={[
                    theme.typography.label.md,
                    styles.sectionHeader,
                    { color: theme.colors.textFaint },
                  ]}
                >
                  Archived
                </Text>
                {/* Archived categories visually recede via opacity. Tap
                    still works so the user can unarchive from the edit
                    screen. */}
                <View style={[styles.card, { opacity: theme.opacity.paid }]}>
                  {archived.map((c, i) => (
                    <CategoryRow
                      key={c.id}
                      category={c}
                      onPress={handleRowPress}
                      isLast={i === archived.length - 1}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>
        )}

        <Pressable
          onPress={handleAdd}
          accessibilityRole="button"
          accessibilityLabel="Add a category"
          hitSlop={8}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: theme.colors.accent,
              opacity: pressed ? theme.opacity.muted : 1,
            },
          ]}
        >
          <Text style={[styles.fabIcon, { color: theme.colors.bg }]}>+</Text>
        </Pressable>
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.xxl,
      paddingVertical: theme.spacing.xxxl,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.xxxl,
    },
    section: {
      marginBottom: theme.spacing.lg,
    },
    sectionHeader: {
      textTransform: 'uppercase',
      paddingTop: theme.spacing.xs,
      paddingBottom: theme.spacing.sm,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      borderColor: theme.colors.border,
      borderWidth: theme.borderWidth.hairline,
      overflow: 'hidden',
    },
    fab: {
      position: 'absolute',
      right: theme.spacing.xxl,
      bottom: theme.spacing.xxl,
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 4,
    },
    fabIcon: {
      fontSize: 28,
      lineHeight: 32,
      fontWeight: '500',
    },
  });
}

function makeRowStyles(theme: Theme) {
  return StyleSheet.create({
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

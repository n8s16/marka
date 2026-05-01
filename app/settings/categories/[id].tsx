// Add / edit category screen.
//
// Route: `/settings/categories/new` (add) or `/settings/categories/<uuid>`
// (edit). The literal `"new"` is the add-mode sentinel — same convention
// used by `/bills/new` and `/settings/wallets/new`. Both paths route
// through this file because they share the same form.
//
// PRD §"Supporting screens" — Settings (categories): add, rename, archive.
// Categories carry only a `name` from the user's perspective; the schema
// has an `icon` field but no icon library is wired up in v1, so we leave
// it null (same pattern as wallets).
//
// Hard delete is intentionally NOT exposed. Per docs/DATA_MODEL.md
// "Archive, don't delete." Archive (or unarchive when already archived)
// is the only user-facing destructive path. The data layer's
// hardDeleteCategory exists for future use but no UI surfaces it in v1.
//
// New-category sort_order: assigned at submit time as
// max(existing sort_order) + 1 so new categories slot at the end of the
// list, after the seeded eight.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { TextField } from '@/components/text-field';
import { useDb } from '@/db/client';
import {
  archiveCategory,
  createCategory,
  getCategoryById,
  listCategories,
  unarchiveCategory,
  updateCategory,
  type Category,
} from '@/db/queries/categories';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

interface FormState {
  name: string;
}

interface FieldErrors {
  name?: string;
}

function emptyForm(): FormState {
  return { name: '' };
}

function categoryToForm(c: Category): FormState {
  return { name: c.name };
}

export default function CategoryEditScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = typeof rawId === 'string' ? rawId : '';
  const isNew = id === 'new';

  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [existing, setExisting] = useState<Category | null>(null);

  // Load existing category for edit mode.
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    getCategoryById(db, id)
      .then((c) => {
        if (cancelled) return;
        if (!c) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setExisting(c);
        setForm(categoryToForm(c));
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setSubmitError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [db, id, isNew]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key as keyof FieldErrors]) {
      setErrors((e) => ({ ...e, [key]: undefined }));
    }
  }

  function validate(): { name: string } | null {
    const next: FieldErrors = {};
    const name = form.name.trim();
    if (!name) next.name = 'Name is required.';
    setErrors(next);
    if (Object.keys(next).length > 0) return null;
    return { name };
  }

  async function handleSave() {
    setSubmitError(null);
    const payload = validate();
    if (!payload) return;

    setSaving(true);
    try {
      if (isNew) {
        // Slot new categories at the end of the user's preferred order. We
        // include archived rows when computing the max so unarchiving an
        // older row later doesn't collide with a newer sort_order.
        const all = await listCategories(db, { includeArchived: true });
        const maxOrder = all.reduce(
          (acc, c) => (c.sort_order > acc ? c.sort_order : acc),
          -1,
        );
        await createCategory(db, {
          name: payload.name,
          icon: null,
          archived: false,
          sort_order: maxOrder + 1,
        });
      } else {
        // Edit mode patches only the name. archived, sort_order, icon are
        // managed elsewhere (archive button below; reordering not in v1).
        await updateCategory(db, id, { name: payload.name });
      }
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleArchive() {
    Alert.alert(
      'Archive this category?',
      'Archived categories will be hidden from pickers but historical expenses referencing this category still resolve. You can restore from the archived list later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveCategory(db, id);
              router.back();
            } catch (err) {
              setSubmitError((err as Error).message);
            }
          },
        },
      ],
    );
  }

  async function handleUnarchive() {
    setSubmitError(null);
    try {
      await unarchiveCategory(db, id);
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    }
  }

  if (notFound) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={[theme.typography.body.md, { color: theme.colors.text }]}>
            Category not found.
          </Text>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={{ marginTop: theme.spacing.md }}
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
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text
            style={[
              theme.typography.body.md,
              { color: theme.colors.textMuted },
            ]}
          >
            Loading…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const isArchived = !!existing?.archived;

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text
            style={[theme.typography.body.sm, { color: theme.colors.accent }]}
          >
            Cancel
          </Text>
        </Pressable>
        <Text
          style={[theme.typography.title.sm, { color: theme.colors.text }]}
        >
          {isNew ? 'Add category' : 'Edit category'}
        </Text>
        <Pressable onPress={handleSave} disabled={saving} hitSlop={8}>
          <Text
            style={[
              theme.typography.body.sm,
              {
                color: saving ? theme.colors.textMuted : theme.colors.accent,
                fontWeight: theme.typography.weights.medium,
              },
            ]}
          >
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {submitError ? (
            <View
              style={[
                styles.errorBanner,
                { borderColor: theme.colors.danger },
              ]}
            >
              <Text
                style={[
                  theme.typography.body.sm,
                  { color: theme.colors.danger },
                ]}
              >
                {submitError}
              </Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <TextField
              label="Name"
              value={form.name}
              onChangeText={(v) => set('name', v)}
              placeholder="e.g. Groceries"
              error={errors.name ?? null}
              autoCapitalize="words"
              returnKeyType="done"
            />
          </View>

          {!isNew ? (
            <View style={[styles.field, { marginTop: theme.spacing.xl }]}>
              {isArchived ? (
                <Pressable
                  onPress={handleUnarchive}
                  accessibilityRole="button"
                  style={[
                    styles.actionButton,
                    { borderColor: theme.colors.accent },
                  ]}
                >
                  <Text
                    style={[
                      theme.typography.body.md,
                      {
                        color: theme.colors.accent,
                        fontWeight: theme.typography.weights.medium,
                      },
                    ]}
                  >
                    Unarchive category
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={handleArchive}
                  accessibilityRole="button"
                  style={[
                    styles.actionButton,
                    { borderColor: theme.colors.danger },
                  ]}
                >
                  <Text
                    style={[
                      theme.typography.body.md,
                      {
                        color: theme.colors.danger,
                        fontWeight: theme.typography.weights.medium,
                      },
                    ]}
                  >
                    Archive category
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}

          <View style={{ height: theme.spacing.xxxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.md,
      borderBottomWidth: theme.borderWidth.hairline,
      borderColor: theme.colors.border,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xxxl,
    },
    field: {
      marginBottom: theme.spacing.lg,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    errorBanner: {
      borderWidth: theme.borderWidth.hairline,
      borderRadius: theme.radii.sm,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.lg,
    },
    actionButton: {
      borderWidth: theme.borderWidth.hairline,
      borderRadius: theme.radii.sm,
      paddingVertical: theme.spacing.md,
      alignItems: 'center',
    },
  });
}

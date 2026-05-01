// Add / edit wallet screen.
//
// Route: `/settings/wallets/new` (add) or `/settings/wallets/<uuid>` (edit).
// The literal `"new"` is the add-mode sentinel — same pattern as
// `/bills/new` and `/transfers/new`. Both routes render through this file.
//
// PRD §"Supporting screens" — Manage wallets: name, type, color. The
// `icon` field stays null in v1 — the data model allows it but no icon
// library is wired up. The show-balance toggle and opening-balance flow
// described in the same PRD line are intentionally deferred to step 11.
//
// Hard delete is intentionally NOT exposed. Per docs/DATA_MODEL.md
// "Archive, don't delete." Archive (or unarchive when already archived)
// is the only user-facing destructive path. The data layer's
// hardDeleteWallet exists for future use but no UI surfaces it in v1.
//
// Layout mirrors `app/bills/[id]/index.tsx`: header with Cancel + title +
// Save, KeyboardAvoidingView wrapping ScrollView. Validation pattern
// matches: per-field FieldErrors, cleared on edit.

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

import { ColorPicker, isValidHexColor } from '@/components/color-picker';
import { SegmentedChips } from '@/components/segmented-chips';
import { TextField } from '@/components/text-field';
import { useDb } from '@/db/client';
import {
  archiveWallet,
  createWallet,
  getWalletById,
  unarchiveWallet,
  updateWallet,
  type Wallet,
  type WalletInsert,
} from '@/db/queries/wallets';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';
import { walletBrand } from '@/styles/tokens';

type WalletType = Wallet['type'];

const TYPE_OPTIONS: ReadonlyArray<{ value: WalletType; label: string }> = [
  { value: 'e_wallet', label: 'E-wallet' },
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
];

// Default for new wallets — Maya green as a reasonable, on-brand starting
// color for a fresh PH wallet. Users almost always change it, but this
// avoids the user being forced to think about color before they've named
// the wallet.
const DEFAULT_NEW_COLOR: string = walletBrand.maya;

interface FormState {
  name: string;
  type: WalletType;
  color: string;
}

interface FieldErrors {
  name?: string;
  type?: string;
  color?: string;
}

function emptyForm(): FormState {
  return {
    name: '',
    type: 'e_wallet',
    color: DEFAULT_NEW_COLOR,
  };
}

function walletToForm(w: Wallet): FormState {
  return {
    name: w.name,
    type: w.type,
    color: w.color,
  };
}

function validate(form: FormState): {
  errors: FieldErrors;
  payload: WalletInsert | null;
} {
  const errors: FieldErrors = {};

  const name = form.name.trim();
  if (!name) errors.name = 'Name is required.';

  if (
    form.type !== 'e_wallet' &&
    form.type !== 'bank' &&
    form.type !== 'cash'
  ) {
    errors.type = 'Pick a wallet type.';
  }

  if (!isValidHexColor(form.color)) {
    errors.color = 'Pick a color.';
  }

  if (Object.keys(errors).length > 0) {
    return { errors, payload: null };
  }

  // All required fields are valid here.
  // `icon`, `show_balance`, `opening_balance`, `archived` left to defaults
  // for create. For update we explicitly pass only the editable fields so
  // existing archived/show_balance state is preserved.
  const payload: WalletInsert = {
    name,
    type: form.type,
    color: form.color,
    icon: null,
    show_balance: false,
    opening_balance: null,
    archived: false,
  };
  return { errors, payload };
}

export default function WalletEditScreen() {
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
  const [existing, setExisting] = useState<Wallet | null>(null);

  // Load existing wallet for edit mode.
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    getWalletById(db, id)
      .then((w) => {
        if (cancelled) return;
        if (!w) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setExisting(w);
        setForm(walletToForm(w));
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

  async function handleSave() {
    setSubmitError(null);
    const { errors: nextErrors, payload } = validate(form);
    setErrors(nextErrors);
    if (!payload) return;

    setSaving(true);
    try {
      if (isNew) {
        await createWallet(db, payload);
      } else {
        // For edit, only patch the editable fields. Preserves archived,
        // show_balance, opening_balance state set elsewhere.
        await updateWallet(db, id, {
          name: payload.name,
          type: payload.type,
          color: payload.color,
        });
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
      'Archive this wallet?',
      'Active wallets will be hidden from pickers but historical transactions referencing this wallet still resolve. You can restore from the archived list later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveWallet(db, id);
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
      await unarchiveWallet(db, id);
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
            Wallet not found.
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
          {isNew ? 'Add wallet' : 'Edit wallet'}
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
              placeholder="e.g. Seabank"
              error={errors.name ?? null}
              autoCapitalize="words"
              returnKeyType="done"
            />
          </View>

          <View style={styles.field}>
            <SegmentedChips
              label="Type"
              options={TYPE_OPTIONS}
              value={form.type}
              onChange={(v) => set('type', v)}
              error={errors.type ?? null}
            />
          </View>

          <View style={styles.field}>
            <ColorPicker
              label="Color"
              value={form.color}
              onChange={(v) => set('color', v)}
              error={errors.color ?? null}
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
                    Unarchive wallet
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
                    Archive wallet
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

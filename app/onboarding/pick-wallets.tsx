// Onboarding step 1 — pick wallets.
//
// Per docs/PRD.md §"Onboarding (first run only)":
//   "Pick wallets — Maya, GCash, UnionBank, Cash pre-checked.
//    '+ Add another' for less common ones. Continue."
//
// UX:
//   - Four checkbox rows, one per starter wallet from `STARTER_WALLETS`.
//     All pre-checked. Tapping a row toggles it.
//   - "+ Add another" expands an inline name input. Custom wallets are
//     created with `type: 'e_wallet'` and a fallback color (the wallet
//     edit screen's default). Users can refine in Settings → Manage wallets.
//   - "Continue" creates the selected starters + custom adds, then routes
//     to the next onboarding step. Validation: at least one wallet is
//     selected (otherwise the user is locked out of the bill flow because
//     bills require a default wallet).
//
// We do NOT mark onboarding complete here — that flips on save/skip in
// the add-first-bill step. If the user backgrounds the app between steps,
// re-launching boots back into pick-wallets only when no wallet exists yet.
// After step 1 inserts wallets, even a mid-flow background skips step 1
// going forward, which is the correct behaviour.

import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { TextField } from '@/components/text-field';
import { useDb } from '@/db/client';
import { createWallet } from '@/db/queries/wallets';
import { STARTER_WALLETS } from '@/db/seed';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';
import { walletBrand } from '@/styles/tokens';

// Default for ad-hoc custom wallets entered inline. Mirrors the
// wallets/[id] edit screen so users see consistent starter colors.
const DEFAULT_CUSTOM_COLOR: string = walletBrand.maya;

interface CustomWallet {
  /** Local-only id used as React key while the row is unsaved. */
  key: string;
  name: string;
}

export default function OnboardingPickWalletsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const router = useRouter();

  // Map keyed by starter wallet name → checked. Defaults all four to true.
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const w of STARTER_WALLETS) init[w.name] = true;
    return init;
  });

  const [customs, setCustoms] = useState<CustomWallet[]>([]);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const checkedStarters = STARTER_WALLETS.filter((w) => checked[w.name]);
  const totalSelected = checkedStarters.length + customs.length;

  function toggleStarter(name: string) {
    setChecked((c) => ({ ...c, [name]: !c[name] }));
  }

  function commitCustom() {
    const trimmed = customDraft.trim();
    if (!trimmed) {
      setCustomError('Name is required.');
      return;
    }
    const dupeStarter = STARTER_WALLETS.some(
      (w) => w.name.toLowerCase() === trimmed.toLowerCase(),
    );
    const dupeCustom = customs.some(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (dupeStarter || dupeCustom) {
      setCustomError('A wallet with this name already exists in the list.');
      return;
    }
    setCustoms((prev) => [
      ...prev,
      { key: `${Date.now()}-${prev.length}`, name: trimmed },
    ]);
    setCustomDraft('');
    setCustomError(null);
    setShowAddCustom(false);
  }

  function removeCustom(key: string) {
    setCustoms((prev) => prev.filter((c) => c.key !== key));
  }

  async function handleContinue() {
    setSubmitError(null);
    if (totalSelected === 0) {
      setSubmitError('Pick at least one wallet to continue.');
      return;
    }
    setSaving(true);
    try {
      // Create wallets sequentially so created_at ordering is stable in the
      // order the user sees them: starters first (in the canonical list
      // order), then customs in entry order.
      for (const w of checkedStarters) {
        await createWallet(db, {
          name: w.name,
          color: w.color,
          icon: null,
          type: w.type,
          show_balance: false,
          opening_balance: null,
          archived: false,
        });
      }
      for (const c of customs) {
        await createWallet(db, {
          name: c.name,
          color: DEFAULT_CUSTOM_COLOR,
          icon: null,
          type: 'e_wallet',
          show_balance: false,
          opening_balance: null,
          archived: false,
        });
      }
      router.replace('/onboarding/add-first-bill');
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[theme.typography.title.md, { color: theme.colors.text }]}>
            Pick your wallets
          </Text>
          <Text
            style={[
              theme.typography.body.sm,
              styles.subhead,
              { color: theme.colors.textMuted },
            ]}
          >
            These are the accounts you spend from. You can edit, archive, or
            add more later in Settings.
          </Text>

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

          <View style={styles.list}>
            {STARTER_WALLETS.map((w, idx) => {
              const isChecked = !!checked[w.name];
              return (
                <Pressable
                  key={w.name}
                  onPress={() => toggleStarter(w.name)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: isChecked }}
                  accessibilityLabel={w.name}
                  style={({ pressed }) => [
                    styles.row,
                    idx > 0 && {
                      borderTopWidth: theme.borderWidth.hairline,
                      borderTopColor: theme.colors.border,
                    },
                    pressed && { backgroundColor: theme.colors.surfaceMuted },
                  ]}
                >
                  <View
                    style={[styles.colorDot, { backgroundColor: w.color }]}
                  />
                  <Text
                    style={[
                      theme.typography.body.md,
                      styles.rowLabel,
                      { color: theme.colors.text },
                    ]}
                  >
                    {w.name}
                  </Text>
                  <Switch
                    value={isChecked}
                    onValueChange={() => toggleStarter(w.name)}
                    accessibilityLabel={w.name}
                  />
                </Pressable>
              );
            })}

            {customs.map((c, idx) => (
              <View
                key={c.key}
                style={[
                  styles.row,
                  {
                    borderTopWidth: theme.borderWidth.hairline,
                    borderTopColor: theme.colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.colorDot,
                    { backgroundColor: DEFAULT_CUSTOM_COLOR },
                  ]}
                />
                <Text
                  style={[
                    theme.typography.body.md,
                    styles.rowLabel,
                    { color: theme.colors.text },
                  ]}
                  numberOfLines={1}
                >
                  {c.name}
                </Text>
                <Pressable
                  onPress={() => removeCustom(c.key)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${c.name}`}
                >
                  <Text
                    style={[
                      theme.typography.body.sm,
                      { color: theme.colors.danger },
                    ]}
                  >
                    Remove
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>

          {showAddCustom ? (
            <View style={styles.addCustomWrap}>
              <TextField
                label="New wallet"
                value={customDraft}
                onChangeText={(v) => {
                  setCustomDraft(v);
                  if (customError) setCustomError(null);
                }}
                placeholder="e.g. BPI"
                error={customError}
                autoCapitalize="words"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={commitCustom}
              />
              <View style={styles.addCustomActions}>
                <Pressable
                  onPress={() => {
                    setShowAddCustom(false);
                    setCustomDraft('');
                    setCustomError(null);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      theme.typography.body.sm,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={commitCustom}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      theme.typography.body.sm,
                      {
                        color: theme.colors.accent,
                        fontWeight: theme.typography.weights.medium,
                      },
                    ]}
                  >
                    Add
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setShowAddCustom(true)}
              hitSlop={8}
              style={styles.addCustomButton}
              accessibilityRole="button"
            >
              <Text
                style={[
                  theme.typography.body.sm,
                  {
                    color: theme.colors.accent,
                    fontWeight: theme.typography.weights.medium,
                  },
                ]}
              >
                + Add another
              </Text>
            </Pressable>
          )}
        </ScrollView>

        <View
          style={[
            styles.footer,
            { borderTopColor: theme.colors.border },
          ]}
        >
          <Pressable
            onPress={handleContinue}
            disabled={saving || totalSelected === 0}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            style={({ pressed }) => [
              styles.continueButton,
              {
                backgroundColor: theme.colors.accent,
                opacity:
                  saving || totalSelected === 0
                    ? theme.opacity.muted
                    : pressed
                      ? theme.opacity.muted
                      : 1,
              },
            ]}
          >
            <Text
              style={[
                theme.typography.body.md,
                {
                  color: theme.colors.bg,
                  fontWeight: theme.typography.weights.medium,
                },
              ]}
            >
              {saving ? 'Saving…' : 'Continue'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.bg },
    scrollContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.xl,
      paddingBottom: theme.spacing.xl,
    },
    subhead: {
      marginTop: theme.spacing.sm,
      marginBottom: theme.spacing.xl,
    },
    list: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      borderColor: theme.colors.border,
      borderWidth: theme.borderWidth.hairline,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.md,
    },
    colorDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      marginRight: theme.spacing.md,
    },
    rowLabel: {
      flex: 1,
    },
    addCustomButton: {
      marginTop: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      alignItems: 'flex-start',
    },
    addCustomWrap: {
      marginTop: theme.spacing.md,
    },
    addCustomActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: theme.spacing.sm,
      gap: theme.spacing.lg,
    },
    errorBanner: {
      borderWidth: theme.borderWidth.hairline,
      borderRadius: theme.radii.sm,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.lg,
    },
    footer: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.lg,
      borderTopWidth: theme.borderWidth.hairline,
    },
    continueButton: {
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radii.md,
      alignItems: 'center',
    },
  });
}

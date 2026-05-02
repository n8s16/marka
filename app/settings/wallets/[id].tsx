// Add / edit wallet screen.
//
// Route: `/settings/wallets/new` (add) or `/settings/wallets/<uuid>` (edit).
// The literal `"new"` is the add-mode sentinel — same pattern as
// `/bills/new` and `/transfers/new`. Both routes render through this file.
//
// PRD §"Supporting screens" — Manage wallets: name, type, color,
// show-balance toggle. The `icon` field stays null in v1 — the data model
// allows it but no icon library is wired up.
//
// Show-balance toggle (PRD §"Behavior decisions"):
//   - Off by default, per PRD §"Outflow-primary, balance-optional".
//   - Flipping ON reveals a "Current balance" CurrencyInput. We
//     back-calculate `opening_balance` via `computeOpeningBalance` from the
//     reported current balance and ALL recorded events for the wallet
//     (total-time, NOT month-windowed — see logic/wallet-balance.ts).
//   - Flipping OFF leaves `opening_balance` as-is in the DB. If the user
//     re-enables, we re-prompt and recompute fresh.
//   - The current-balance prompt is ALWAYS visible when the toggle is ON.
//     If the wallet already has an opening_balance recorded, we pre-fill
//     the input with the COMPUTED current balance (opening + inflows −
//     outflows) so the user can see what's currently tracked. Saving
//     without changing the value is idempotent — same value in, same
//     opening_balance out. Changing the value recalibrates.
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
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ColorPicker, isValidHexColor } from '@/components/color-picker';
import { CurrencyInput } from '@/components/currency-input';
import { SegmentedChips } from '@/components/segmented-chips';
import { TextField } from '@/components/text-field';
import { useDb } from '@/db/client';
import { listBillPayments } from '@/db/queries/bill-payments';
import { listExpenses } from '@/db/queries/expenses';
import { listTransfers } from '@/db/queries/transfers';
import {
  archiveWallet,
  createWallet,
  getWalletById,
  unarchiveWallet,
  updateWallet,
  type Wallet,
  type WalletInsert,
} from '@/db/queries/wallets';
import { computeOpeningBalance, getWalletBalance } from '@/logic/wallet-balance';
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
  showBalance: boolean;
  // Centavo value typed by the user as their *current* balance. We
  // back-calculate `opening_balance` from this on save. `null` while empty
  // or while the input is invalid — the parser owns invalid-state messaging.
  currentBalance: number | null;
}

interface FieldErrors {
  name?: string;
  type?: string;
  color?: string;
  currentBalance?: string;
}

function emptyForm(): FormState {
  return {
    name: '',
    type: 'e_wallet',
    color: DEFAULT_NEW_COLOR,
    showBalance: false,
    currentBalance: null,
  };
}

function walletToForm(w: Wallet): FormState {
  return {
    name: w.name,
    type: w.type,
    color: w.color,
    showBalance: w.show_balance,
    // The events-driven effect below pre-fills this with the computed
    // current balance once events load. We start at null to mark the
    // pre-fill as not-yet-loaded.
    currentBalance: null,
  };
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
  // Computed current balance from the wallet's stored opening_balance plus
  // total-time events. Used to pre-fill the input when the user opens a
  // wallet that already has show_balance ON, and to seed the input on
  // toggle-ON within a session. `null` until events load or when the wallet
  // has no opening_balance recorded.
  const [computedCurrentBalance, setComputedCurrentBalance] = useState<
    number | null
  >(null);

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

  // Once the wallet loads, fetch its total-time events and compute the
  // current balance. We compute regardless of `show_balance` so the value
  // is ready to seed the input if the user toggles ON in this session.
  // Pass `show_balance: true` into getWalletBalance so it returns a value
  // even when the wallet has the toggle off — we only need opening_balance
  // to be non-null. When opening_balance is null, computed stays null.
  useEffect(() => {
    if (isNew) return;
    if (!existing) return;
    if (existing.opening_balance === null) {
      setComputedCurrentBalance(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      listBillPayments(db, { walletId: id }),
      listExpenses(db, { walletId: id }),
      listTransfers(db, { walletId: id }),
    ])
      .then(([payments, expenses, transfers]) => {
        if (cancelled) return;
        const computed = getWalletBalance(
          {
            id: existing.id,
            show_balance: true,
            opening_balance: existing.opening_balance,
          },
          payments,
          expenses,
          transfers,
        );
        setComputedCurrentBalance(computed);
        // Pre-fill the form's currentBalance only when the wallet was
        // loaded with show_balance: true. If the wallet was OFF, the user
        // explicitly opted out and the input stays empty until they
        // toggle ON in this session — at which point the toggle handler
        // seeds it from `computedCurrentBalance`.
        if (existing.show_balance && computed !== null) {
          setForm((f) =>
            f.currentBalance === null ? { ...f, currentBalance: computed } : f,
          );
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setSubmitError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [db, id, isNew, existing]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key as keyof FieldErrors]) {
      setErrors((e) => ({ ...e, [key]: undefined }));
    }
  }

  function handleToggleShowBalance(next: boolean) {
    setForm((f) => ({
      ...f,
      showBalance: next,
      // Turning ON: seed the input with the computed current balance if
      // the wallet already has events tracked. Falls back to the field's
      // existing value (which may be a number the user just typed before
      // toggling OFF→ON, or null for a brand-new toggle ON).
      // Turning OFF: clear so re-enabling starts from a known state.
      currentBalance: next ? (computedCurrentBalance ?? f.currentBalance) : null,
    }));
    if (errors.currentBalance) {
      setErrors((e) => ({ ...e, currentBalance: undefined }));
    }
  }

  async function handleSave() {
    setSubmitError(null);

    // ---- Validation ----
    const nextErrors: FieldErrors = {};
    const trimmedName = form.name.trim();
    if (!trimmedName) nextErrors.name = 'Name is required.';
    if (
      form.type !== 'e_wallet' &&
      form.type !== 'bank' &&
      form.type !== 'cash'
    ) {
      nextErrors.type = 'Pick a wallet type.';
    }
    if (!isValidHexColor(form.color)) {
      nextErrors.color = 'Pick a color.';
    }
    if (form.showBalance) {
      if (form.currentBalance === null) {
        nextErrors.currentBalance =
          'Enter the current balance in this wallet.';
      } else if (form.currentBalance < 0) {
        nextErrors.currentBalance = 'Negative amounts are not allowed.';
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      if (isNew) {
        // For a new wallet there are no events yet, so computeOpeningBalance
        // resolves to currentBalance directly.
        const opening_balance =
          form.showBalance && form.currentBalance !== null
            ? computeOpeningBalance(
                /* unused walletId pre-creation */ '',
                form.currentBalance,
                [],
                [],
                [],
              )
            : null;
        const payload: WalletInsert = {
          name: trimmedName,
          type: form.type,
          color: form.color,
          icon: null,
          show_balance: form.showBalance,
          opening_balance,
          archived: false,
        };
        await createWallet(db, payload);
      } else {
        // Patch only editable fields. Preserves archived state.
        const patch: Parameters<typeof updateWallet>[2] = {
          name: trimmedName,
          type: form.type,
          color: form.color,
          show_balance: form.showBalance,
        };

        if (form.showBalance && form.currentBalance !== null) {
          // Always recompute opening_balance from the (possibly pre-filled)
          // current balance. Idempotent when the user didn't change the
          // pre-filled value:
          //   computed_balance = opening - outflows + inflows
          //   new_opening      = computed_balance + outflows - inflows
          //                    = opening
          // CRITICAL: pass ALL events for this wallet (no date filter) — see
          // the total-time contract in logic/wallet-balance.ts. A month
          // window here would corrupt the round-trip silently.
          const [payments, expenses, transfers] = await Promise.all([
            listBillPayments(db, { walletId: id }),
            listExpenses(db, { walletId: id }),
            listTransfers(db, { walletId: id }),
          ]);
          patch.opening_balance = computeOpeningBalance(
            id,
            form.currentBalance,
            payments,
            expenses,
            transfers,
          );
        }
        // When show_balance flips OFF: per spec, leave opening_balance as-is
        // so re-enabling with a fresh prompt is the only way it gets
        // recomputed. The patch intentionally omits opening_balance.

        await updateWallet(db, id, patch);
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

  // The current-balance prompt is always visible when the toggle is ON.
  // For wallets that already have show_balance + opening_balance recorded,
  // the field is pre-filled with the computed current balance so the user
  // can see what's tracked. Saving without changing it is idempotent.
  const showBalancePrompt = form.showBalance;

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

          {/* Show-balance toggle. Off by default per PRD §"Outflow-primary,
              balance-optional". When flipped ON, the current-balance prompt
              appears below; we use that to back-calculate opening_balance. */}
          <View style={styles.field}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleLabelWrap}>
                <Text
                  style={[
                    theme.typography.body.md,
                    { color: theme.colors.text },
                  ]}
                >
                  Show running balance
                </Text>
                <Text
                  style={[
                    theme.typography.label.sm,
                    {
                      color: theme.colors.textMuted,
                      marginTop: theme.spacing.xs,
                    },
                  ]}
                >
                  Off by default. When on, this wallet shows a balance line
                  on the Wallets tab.
                </Text>
              </View>
              <Switch
                value={form.showBalance}
                onValueChange={handleToggleShowBalance}
                accessibilityLabel="Show running balance"
              />
            </View>

            {showBalancePrompt ? (
              <View style={styles.promptWrap}>
                <CurrencyInput
                  label="Current balance"
                  value={form.currentBalance}
                  onChange={(v) => set('currentBalance', v)}
                  placeholder="0.00"
                  error={errors.currentBalance ?? null}
                />
                <Text
                  style={[
                    theme.typography.label.sm,
                    styles.promptHelper,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  Tell us what this wallet currently holds. We&rsquo;ll
                  back-calculate the opening balance from your recorded
                  transactions.
                </Text>
              </View>
            ) : null}
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
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    toggleLabelWrap: {
      flex: 1,
      marginRight: theme.spacing.md,
    },
    promptWrap: {
      marginTop: theme.spacing.md,
    },
    promptHelper: {
      marginTop: theme.spacing.xs,
    },
  });
}

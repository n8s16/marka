// Add / edit transfer screen.
//
// Route: `/transfers/new` (add) or `/transfers/<uuid>` (edit). The literal
// `"new"` is the sentinel for add mode — Expo Router routes both via this
// file because they share the same form. Mirrors `app/expenses/[id].tsx`
// in structure.
//
// PRD §"Supporting screens" — Add/edit transfer: from wallet, to wallet,
// amount, date, optional note.
//
// Validation: from wallet and to wallet must differ. The data model and
// query layer don't enforce this — it's a UX-level rule per PRD — and we
// don't want to surface a SQLite-flavored error if the user picks the same
// wallet on both sides.
//
// Critical (DATA_MODEL.md): "Transfers must NEVER appear in spending or
// outflow totals at the aggregate level." The aggregation in
// `logic/aggregations.ts` already excludes transfers, so this screen only
// has to persist them. Per-wallet outflow on the Wallets tab includes the
// from-side of a transfer (correct) without our involvement.
//
// Delete: hard delete via `hardDeleteTransfer`. Same reasoning as expense —
// event tables have no `archived` flag.

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
import { format as formatDateFns } from 'date-fns';

import { CurrencyInput } from '@/components/currency-input';
import { DateInput } from '@/components/date-input';
import { OldDateWarning, isOldDate } from '@/components/old-date-warning';
import { TextField } from '@/components/text-field';
import { WalletPicker } from '@/components/wallet-picker';
import { useDb } from '@/db/client';
import {
  createTransfer,
  getTransferById,
  hardDeleteTransfer,
  updateTransfer,
  type Transfer,
  type TransferInsert,
} from '@/db/queries/transfers';
import { listWallets, type Wallet } from '@/db/queries/wallets';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

interface FormState {
  fromWalletId: string | null;
  toWalletId: string | null;
  amount: number | null;
  date: string; // YYYY-MM-DD
  note: string;
}

interface FieldErrors {
  fromWalletId?: string;
  toWalletId?: string;
  amount?: string;
  date?: string;
}

function emptyForm(today: Date): FormState {
  return {
    fromWalletId: null,
    toWalletId: null,
    amount: null,
    date: formatDateFns(today, 'yyyy-MM-dd'),
    note: '',
  };
}

function transferToForm(t: Transfer): FormState {
  return {
    fromWalletId: t.from_wallet_id,
    toWalletId: t.to_wallet_id,
    amount: t.amount,
    date: t.date,
    note: t.note ?? '',
  };
}

function validate(form: FormState): {
  errors: FieldErrors;
  payload: TransferInsert | null;
} {
  const errors: FieldErrors = {};

  if (!form.fromWalletId) errors.fromWalletId = 'Pick the source wallet.';
  if (!form.toWalletId) errors.toWalletId = 'Pick the destination wallet.';

  // Same-wallet transfer is meaningless; reject with a clear message.
  if (
    form.fromWalletId &&
    form.toWalletId &&
    form.fromWalletId === form.toWalletId
  ) {
    errors.toWalletId = 'Pick a different wallet from the source.';
  }

  if (form.amount === null || form.amount <= 0) {
    errors.amount = 'Enter an amount greater than zero.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
    errors.date = 'Pick a date.';
  }

  if (Object.keys(errors).length > 0) {
    return { errors, payload: null };
  }

  const note = form.note.trim();
  const payload: TransferInsert = {
    from_wallet_id: form.fromWalletId as string,
    to_wallet_id: form.toWalletId as string,
    amount: form.amount as number,
    date: form.date,
    note: note.length > 0 ? note : null,
  };
  return { errors, payload };
}

export default function TransferEditScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = typeof rawId === 'string' ? rawId : '';
  const isNew = id === 'new';

  const today = useMemo(() => new Date(), []);

  const [form, setForm] = useState<FormState>(() => emptyForm(today));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [wallets, setWallets] = useState<Wallet[] | null>(null);
  const [walletError, setWalletError] = useState<Error | null>(null);
  const [oldDateDismissed, setOldDateDismissed] = useState(false);

  // Load wallets for both pickers.
  useEffect(() => {
    let cancelled = false;
    listWallets(db, {})
      .then((rows) => {
        if (cancelled) return;
        setWallets(rows);
        // Default-pick first two wallets for new transfers if available.
        // From-side defaults to the first wallet, to-side to the second so
        // the validation rule "from must differ from to" is already
        // satisfied at form-open. If the user only has one wallet, leave
        // to-side null and let validation prompt them on save.
        if (isNew && rows.length > 0) {
          setForm((f) => ({
            ...f,
            fromWalletId: f.fromWalletId ?? rows[0].id,
            toWalletId:
              f.toWalletId ?? (rows.length > 1 ? rows[1].id : null),
          }));
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setWalletError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [db, isNew]);

  // Load existing transfer for edit mode.
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    getTransferById(db, id)
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setForm(transferToForm(row));
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
        await createTransfer(db, payload);
      } else {
        await updateTransfer(db, id, payload);
      }
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    Alert.alert(
      'Delete transfer?',
      'This permanently removes the transfer record. Per-wallet outflow updates will reflect once you return to the Wallets tab.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await hardDeleteTransfer(db, id);
              router.back();
            } catch (err) {
              setSubmitError((err as Error).message);
            }
          },
        },
      ],
    );
  }

  if (notFound) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text
            style={[theme.typography.body.md, { color: theme.colors.text }]}
          >
            Transfer not found.
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

  const showOldDateWarning =
    !oldDateDismissed && isOldDate(form.date, today);

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
        <Text style={[theme.typography.title.sm, { color: theme.colors.text }]}>
          {isNew ? 'Add transfer' : 'Edit transfer'}
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
              style={[styles.errorBanner, { borderColor: theme.colors.danger }]}
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

          {walletError ? (
            <View
              style={[styles.errorBanner, { borderColor: theme.colors.danger }]}
            >
              <Text
                style={[
                  theme.typography.body.sm,
                  { color: theme.colors.danger },
                ]}
              >
                Failed to load wallets: {walletError.message}
              </Text>
            </View>
          ) : null}

          <View style={styles.field}>
            {wallets ? (
              <WalletPicker
                label="From wallet"
                wallets={wallets}
                selectedId={form.fromWalletId}
                onSelect={(walletId) => set('fromWalletId', walletId)}
                error={errors.fromWalletId ?? null}
              />
            ) : (
              <Text
                style={[
                  theme.typography.body.sm,
                  { color: theme.colors.textMuted },
                ]}
              >
                Loading wallets…
              </Text>
            )}
          </View>

          <View style={styles.field}>
            {wallets ? (
              <WalletPicker
                label="To wallet"
                wallets={wallets}
                selectedId={form.toWalletId}
                onSelect={(walletId) => set('toWalletId', walletId)}
                error={errors.toWalletId ?? null}
              />
            ) : null}
          </View>

          <View style={styles.field}>
            <CurrencyInput
              label="Amount"
              value={form.amount}
              onChange={(v) => set('amount', v)}
              error={errors.amount ?? null}
            />
          </View>

          <View style={styles.field}>
            <DateInput
              label="Date"
              value={form.date}
              onChange={(picked) => {
                set('date', picked);
                setOldDateDismissed(false);
              }}
              error={errors.date ?? null}
            />
          </View>

          {showOldDateWarning ? (
            <View style={styles.field}>
              <OldDateWarning onDismiss={() => setOldDateDismissed(true)} />
            </View>
          ) : null}

          <View style={styles.field}>
            <TextField
              label="Note (optional)"
              value={form.note}
              onChangeText={(v) => set('note', v)}
              placeholder="anything you'll want to remember"
              multiline
              autoCapitalize="sentences"
            />
          </View>

          {!isNew ? (
            <View style={[styles.field, { marginTop: theme.spacing.xl }]}>
              <Pressable
                onPress={handleDelete}
                accessibilityRole="button"
                style={[
                  styles.dangerButton,
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
                  Delete transfer
                </Text>
              </Pressable>
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
    dangerButton: {
      borderWidth: theme.borderWidth.hairline,
      borderRadius: theme.radii.sm,
      paddingVertical: theme.spacing.md,
      alignItems: 'center',
    },
  });
}

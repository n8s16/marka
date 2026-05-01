// Add / edit expense screen.
//
// Route: `/expenses/new` (add) or `/expenses/<uuid>` (edit). The literal
// `"new"` is the sentinel for add mode — Expo Router routes both via this
// file because they share the same form. Mirrors `app/bills/[id]/index.tsx`
// in structure (KeyboardAvoidingView + ScrollView + validate + save/delete).
//
// PRD §"Supporting screens" — Add/edit expense: description, amount
// (optional — DATA_MODEL.md notes `expense.amount` is nullable for
// placeholder entries), category, wallet, date, optional note.
//
// Delete: hard delete via `hardDeleteExpense`. Event tables have no
// `archived` flag (per DATA_MODEL.md "event tables have no archive flag —
// deleting a payment/expense/transfer is a content edit, not an account-
// level decision"), so the only way to remove a typo'd expense is hard
// delete. The Mark-paid sheet uses the same pattern for its Undo path.

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

import { CategoryPicker } from '@/components/category-picker';
import { CurrencyInput } from '@/components/currency-input';
import { DateInput } from '@/components/date-input';
import { OldDateWarning, isOldDate } from '@/components/old-date-warning';
import { TextField } from '@/components/text-field';
import { WalletPicker } from '@/components/wallet-picker';
import { useDb } from '@/db/client';
import { listCategories, type Category } from '@/db/queries/categories';
import {
  createExpense,
  getExpenseById,
  hardDeleteExpense,
  updateExpense,
  type Expense,
  type ExpenseInsert,
} from '@/db/queries/expenses';
import { listWallets, type Wallet } from '@/db/queries/wallets';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

interface FormState {
  description: string;
  amount: number | null; // optional — null is a valid persisted value
  categoryId: string | null;
  walletId: string | null;
  date: string; // YYYY-MM-DD
  note: string;
}

interface FieldErrors {
  description?: string;
  amount?: string;
  categoryId?: string;
  walletId?: string;
  date?: string;
}

function emptyForm(today: Date): FormState {
  return {
    description: '',
    amount: null,
    categoryId: null,
    walletId: null,
    date: formatDateFns(today, 'yyyy-MM-dd'),
    note: '',
  };
}

function expenseToForm(e: Expense): FormState {
  return {
    description: e.description,
    amount: e.amount ?? null,
    categoryId: e.category_id,
    walletId: e.wallet_id,
    date: e.date,
    note: e.note ?? '',
  };
}

function validate(form: FormState): {
  errors: FieldErrors;
  payload: ExpenseInsert | null;
} {
  const errors: FieldErrors = {};

  const description = form.description.trim();
  if (!description) errors.description = 'Description is required.';

  // Amount is optional — only complain if the user typed something invalid
  // (CurrencyInput emits null on invalid keystrokes). The CurrencyInput
  // surfaces parse errors itself, so we don't double-up here; we only
  // reject *negative* amounts at the form level (parseCurrencyInput already
  // rejects them but a future code path that bypasses it shouldn't sneak
  // through). Treat null as "no amount" — that's the placeholder case.
  if (form.amount !== null && form.amount < 0) {
    errors.amount = 'Amount cannot be negative.';
  }

  if (!form.categoryId) errors.categoryId = 'Pick a category.';
  if (!form.walletId) errors.walletId = 'Pick a wallet.';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
    errors.date = 'Pick a date.';
  }

  if (Object.keys(errors).length > 0) {
    return { errors, payload: null };
  }

  const note = form.note.trim();
  const payload: ExpenseInsert = {
    description,
    amount: form.amount,
    category_id: form.categoryId as string,
    wallet_id: form.walletId as string,
    date: form.date,
    note: note.length > 0 ? note : null,
  };
  return { errors, payload };
}

export default function ExpenseEditScreen() {
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
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [refsError, setRefsError] = useState<Error | null>(null);
  const [oldDateDismissed, setOldDateDismissed] = useState(false);

  // Load wallets + categories for the pickers.
  useEffect(() => {
    let cancelled = false;
    Promise.all([listWallets(db, {}), listCategories(db, {})])
      .then(([walletRows, categoryRows]) => {
        if (cancelled) return;
        setWallets(walletRows);
        setCategories(categoryRows);
        // Default-pick the first wallet / category for new expenses if none
        // chosen yet. Mirrors the bill form's default-wallet behavior.
        if (isNew) {
          setForm((f) => ({
            ...f,
            walletId: f.walletId ?? (walletRows[0]?.id ?? null),
            categoryId: f.categoryId ?? (categoryRows[0]?.id ?? null),
          }));
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setRefsError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [db, isNew]);

  // Load existing expense for edit mode.
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    getExpenseById(db, id)
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setForm(expenseToForm(row));
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
        await createExpense(db, payload);
      } else {
        await updateExpense(db, id, payload);
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
      'Delete expense?',
      'This permanently removes the expense. Past amounts in monthly totals will update once you return to the Spending tab.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await hardDeleteExpense(db, id);
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
          <Text style={[theme.typography.body.md, { color: theme.colors.text }]}>
            Expense not found.
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
          {isNew ? 'Add expense' : 'Edit expense'}
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

          {refsError ? (
            <View
              style={[styles.errorBanner, { borderColor: theme.colors.danger }]}
            >
              <Text
                style={[
                  theme.typography.body.sm,
                  { color: theme.colors.danger },
                ]}
              >
                Failed to load wallets or categories: {refsError.message}
              </Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <TextField
              label="Description"
              value={form.description}
              onChangeText={(v) => set('description', v)}
              placeholder="e.g. Lunch at Mang Inasal"
              error={errors.description ?? null}
              autoCapitalize="sentences"
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <CurrencyInput
              label="Amount (optional)"
              value={form.amount}
              onChange={(v) => set('amount', v)}
              error={errors.amount ?? null}
            />
          </View>

          <View style={styles.field}>
            {categories ? (
              <CategoryPicker
                label="Category"
                categories={categories}
                selectedId={form.categoryId}
                onSelect={(catId) => set('categoryId', catId)}
                error={errors.categoryId ?? null}
              />
            ) : (
              <Text
                style={[
                  theme.typography.body.sm,
                  { color: theme.colors.textMuted },
                ]}
              >
                Loading categories…
              </Text>
            )}
          </View>

          <View style={styles.field}>
            {wallets ? (
              <WalletPicker
                label="Wallet"
                wallets={wallets}
                selectedId={form.walletId}
                onSelect={(walletId) => set('walletId', walletId)}
                error={errors.walletId ?? null}
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
            <DateInput
              label="Date"
              value={form.date}
              onChange={(picked) => {
                set('date', picked);
                // Re-arm the warning when the date changes — the user picked
                // a different day and we should re-evaluate freshness.
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
                  Delete expense
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

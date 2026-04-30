// Mark-as-paid modal screen for an existing bill.
//
// Route: `/bills/<id>/mark-paid`. Opened by tapping a row on the Bills tab
// (see components/bill-row.tsx). Presented as a modal — see the per-screen
// `<Stack.Screen options={{ presentation: 'modal' }} />` declaration below.
//
// PRD §"Supporting screens" — Mark as paid: pre-filled amount (editable),
// wallet picker, paid date, period selector (defaults to bill's due-month,
// user-editable), optional note.
//
// Smart defaults come from /logic:
//   - Period: getSmartDefaultPeriodForPayment(bill, today, paidPeriods).
//   - Amount: getForecastForBill(bill, recentPayments).
//
// Conflict handling: createBillPayment throws BillPaymentPeriodConflictError
// when (bill_id, period) already has a payment. We catch it (instanceof) and
// show a three-button alert: Overwrite / Pick a different period / Cancel.

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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { format as formatDateFns, parseISO } from 'date-fns';

import { CurrencyInput } from '@/components/currency-input';
import { DateInput } from '@/components/date-input';
import { OldDateWarning, isOldDate } from '@/components/old-date-warning';
import { PeriodPicker } from '@/components/period-picker';
import { TextField } from '@/components/text-field';
import { WalletPicker } from '@/components/wallet-picker';
import { useDb } from '@/db/client';
import { getBillById, type Bill } from '@/db/queries/bills';
import {
  BillPaymentPeriodConflictError,
  createBillPayment,
  getBillPaymentByBillAndPeriod,
  listBillPayments,
  updateBillPayment,
} from '@/db/queries/bill-payments';
import { listWallets, type Wallet } from '@/db/queries/wallets';
import { getForecastForBill } from '@/logic/forecasts';
import { getSmartDefaultPeriodForPayment } from '@/logic/periods';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

function formatPeriodLabel(period: string): string {
  if (!/^\d{4}-\d{2}$/.test(period)) return period;
  return formatDateFns(parseISO(`${period}-01`), 'MMMM yyyy');
}

interface FormState {
  amount: number | null;
  walletId: string | null;
  paidDate: string;
  period: string;
  note: string;
}

export default function MarkPaidScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = typeof rawId === 'string' ? rawId : '';

  const today = useMemo(() => new Date(), []);
  const todayYmd = useMemo(() => formatDateFns(today, 'yyyy-MM-dd'), [today]);

  const [bill, setBill] = useState<Bill | null>(null);
  const [wallets, setWallets] = useState<Wallet[] | null>(null);
  const [paidPeriods, setPaidPeriods] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [oldDateDismissed, setOldDateDismissed] = useState(false);

  const [form, setForm] = useState<FormState>({
    amount: null,
    walletId: null,
    paidDate: todayYmd,
    period: '',
    note: '',
  });

  // Initial data load — bill, wallets, payments. The smart-default period and
  // forecast amount depend on the bill + payments, so we initialise the form
  // here once everything resolves.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [billRow, walletRows, paymentRows] = await Promise.all([
          getBillById(db, id),
          listWallets(db, {}),
          listBillPayments(db, { billId: id }),
        ]);
        if (cancelled) return;
        if (!billRow) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const periods = paymentRows.map((p) => p.period);
        // Forecast wants last 3 by period desc. Pre-sort + slice for clarity;
        // the helper re-sorts defensively so this is just a perf nicety.
        const recent = [...paymentRows]
          .sort((a, b) => b.period.localeCompare(a.period))
          .slice(0, 3);

        const smartPeriod = getSmartDefaultPeriodForPayment(billRow, today, periods);
        const forecastAmount = getForecastForBill(billRow, recent);

        setBill(billRow);
        setWallets(walletRows);
        setPaidPeriods(periods);
        setForm({
          amount: forecastAmount,
          walletId: billRow.default_wallet_id,
          paidDate: todayYmd,
          period: smartPeriod,
          note: '',
        });
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setLoadError((err as Error).message);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, id, today, todayYmd]);

  const isValid =
    form.amount !== null &&
    form.amount >= 0 &&
    !!form.walletId &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.paidDate) &&
    /^\d{4}-\d{2}$/.test(form.period);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function performOverwrite() {
    if (!isValid || !bill) return;
    try {
      setSaving(true);
      const existing = await getBillPaymentByBillAndPeriod(db, id, form.period);
      if (!existing) {
        // Conflict was raised but the row vanished between the throw and the
        // fetch — surface it rather than silently inserting.
        setSubmitError('The conflicting payment could not be found.');
        return;
      }
      await updateBillPayment(db, existing.id, {
        wallet_id: form.walletId as string,
        amount: form.amount as number,
        paid_date: form.paidDate,
        period: form.period,
        note: form.note.trim() ? form.note.trim() : null,
      });
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!isValid || !bill) return;
    setSubmitError(null);
    setSaving(true);
    try {
      await createBillPayment(db, {
        bill_id: id,
        wallet_id: form.walletId as string,
        amount: form.amount as number,
        paid_date: form.paidDate,
        period: form.period,
        note: form.note.trim() ? form.note.trim() : null,
      });
      router.back();
    } catch (err) {
      if (err instanceof BillPaymentPeriodConflictError) {
        Alert.alert(
          'Already paid',
          'This bill is already paid for that period. What would you like to do?',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => router.back() },
            {
              text: 'Pick a different period',
              onPress: () => {
                /* leave the form open so the user can edit */
              },
            },
            {
              text: 'Overwrite',
              style: 'destructive',
              onPress: () => {
                void performOverwrite();
              },
            },
          ],
        );
      } else {
        setSubmitError((err as Error).message);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <Stack.Screen options={{ presentation: 'modal', headerShown: false }} />
        <View style={styles.center}>
          <Text style={[theme.typography.body.md, { color: theme.colors.textMuted }]}>
            Loading…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (notFound || !bill) {
    return (
      <SafeAreaView style={styles.root}>
        <Stack.Screen options={{ presentation: 'modal', headerShown: false }} />
        <View style={styles.center}>
          <Text style={[theme.typography.body.md, { color: theme.colors.text }]}>
            Bill not found.
          </Text>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={{ marginTop: theme.spacing.md }}
          >
            <Text style={[theme.typography.body.sm, { color: theme.colors.accent }]}>
              Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const showOldDateWarning =
    !oldDateDismissed && isOldDate(form.paidDate, today);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <Stack.Screen options={{ presentation: 'modal', headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[theme.typography.body.sm, { color: theme.colors.accent }]}>
            Cancel
          </Text>
        </Pressable>
        <Text style={[theme.typography.title.sm, { color: theme.colors.text }]}>
          Mark as paid
        </Text>
        <Pressable onPress={handleSave} disabled={!isValid || saving} hitSlop={8}>
          <Text
            style={[
              theme.typography.body.sm,
              {
                color:
                  !isValid || saving
                    ? theme.colors.textMuted
                    : theme.colors.accent,
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
          <View style={styles.summary}>
            <Text
              style={[theme.typography.title.sm, { color: theme.colors.text }]}
              numberOfLines={1}
            >
              {bill.name}
            </Text>
            <Text
              style={[
                theme.typography.body.sm,
                { color: theme.colors.textMuted, marginTop: 2 },
              ]}
            >
              {formatPeriodLabel(form.period)}
            </Text>
          </View>

          {submitError ? (
            <View style={[styles.errorBanner, { borderColor: theme.colors.danger }]}>
              <Text
                style={[theme.typography.body.sm, { color: theme.colors.danger }]}
              >
                {submitError}
              </Text>
            </View>
          ) : null}

          {loadError ? (
            <View style={[styles.errorBanner, { borderColor: theme.colors.danger }]}>
              <Text
                style={[theme.typography.body.sm, { color: theme.colors.danger }]}
              >
                {loadError}
              </Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <CurrencyInput
              label="Amount"
              value={form.amount}
              onChange={(v) => set('amount', v)}
            />
          </View>

          <View style={styles.field}>
            {wallets ? (
              <WalletPicker
                label="Wallet"
                wallets={wallets}
                selectedId={form.walletId}
                onSelect={(walletId) => set('walletId', walletId)}
              />
            ) : (
              <Text style={[theme.typography.body.sm, { color: theme.colors.textMuted }]}>
                Loading wallets…
              </Text>
            )}
          </View>

          <View style={styles.field}>
            <DateInput
              label="Paid date"
              value={form.paidDate}
              onChange={(v) => {
                set('paidDate', v);
                // Reset dismissal when the date changes — a freshly stale date
                // deserves a fresh warning.
                setOldDateDismissed(false);
              }}
            />
          </View>

          {showOldDateWarning ? (
            <View style={styles.field}>
              <OldDateWarning onDismiss={() => setOldDateDismissed(true)} />
            </View>
          ) : null}

          <View style={styles.field}>
            <PeriodPicker
              label="Period"
              bill={bill}
              value={form.period}
              onChange={(v) => set('period', v)}
              today={today}
              paidPeriods={paidPeriods}
            />
          </View>

          <View style={styles.field}>
            <TextField
              label="Note (optional)"
              value={form.note}
              onChangeText={(v) => set('note', v)}
              placeholder="e.g. card ending 1234, or paid via auto-debit"
              multiline
            />
          </View>

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
    summary: {
      marginBottom: theme.spacing.lg,
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
  });
}

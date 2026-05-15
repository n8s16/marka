// Add / edit bill screen.
//
// Route: `/bills/new` (add) or `/bills/<uuid>` (edit). The literal `"new"` is
// the sentinel for add mode — Expo Router routes both via this file because
// they share the same form.
//
// PRD §"Supporting screens" — Add/edit bill: name, expected amount, frequency
// (monthly/quarterly/yearly/custom — custom takes interval_months), first
// due date (combines start_period + due_day; see DECISIONS §25), default
// wallet, reminder offset, reminder time, auto_forecast.
//
// The Delete affordance maps to `archiveBill` (soft delete) per DATA_MODEL.md
// "Archived entities preserve history". Hard delete cascades to BillPayments
// and is intentionally NOT exposed here — manage-bills (Settings) is the place
// for that, with a separate confirmation flow. From the user's perspective
// "Delete" reads cleanly because archived bills no longer appear in the Bills
// tab; old payments still resolve their bill_id via includeArchived lookups.

import { useEffect, useMemo, useState } from 'react';
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
import { showConfirm } from '@/utils/confirm';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  format as formatDateFns,
  addMonths,
  differenceInCalendarMonths,
  parse as parseDateFns,
  isValid as isValidDateFns,
} from 'date-fns';

import { CurrencyInput } from '@/components/currency-input';
import { DateInput, TimeInput } from '@/components/date-input';
import { SegmentedChips } from '@/components/segmented-chips';
import { TextField } from '@/components/text-field';
import { WalletPicker } from '@/components/wallet-picker';
import { useDb } from '@/db/client';
import {
  archiveBill,
  createBill,
  getBillById,
  updateBill,
  type Bill,
  type BillInsert,
} from '@/db/queries/bills';
import { listWallets, type Wallet } from '@/db/queries/wallets';
import { formatCurrency } from '@/logic/currency';
import { setOnboardingCompleted } from '@/state/onboarding';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

type FrequencyOption = 'monthly' | 'quarterly' | 'yearly' | 'custom';
type EndsMode = 'never' | 'after_n';

const FREQUENCY_OPTIONS: ReadonlyArray<{ value: FrequencyOption; label: string }> = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
];

const ENDS_OPTIONS: ReadonlyArray<{ value: EndsMode; label: string }> = [
  { value: 'never', label: 'Never' },
  { value: 'after_n', label: 'After N periods' },
];

interface FormState {
  name: string;
  expectedAmount: number | null;
  frequency: FrequencyOption;
  intervalMonths: string; // string for typing; coerced on submit
  dueDay: string;
  startPeriod: string;
  defaultWalletId: string | null;
  reminderOffsetDays: string;
  reminderTime: string;
  autoForecast: boolean;
  endsMode: EndsMode;
  endsN: string; // numeric string for typing; '' when unset
}

interface FieldErrors {
  name?: string;
  expectedAmount?: string;
  intervalMonths?: string;
  dueDay?: string;
  startPeriod?: string;
  defaultWalletId?: string;
  reminderOffsetDays?: string;
  reminderTime?: string;
  endsN?: string;
}

function todayPeriodString(today: Date): string {
  return formatDateFns(today, 'yyyy-MM');
}

// Compose the combined "First due date" string (YYYY-MM-DD) from the form's
// separate `dueDay` + `startPeriod` fields. The data model stores them as two
// columns (per docs/DATA_MODEL.md and DECISIONS §22, §23); the form merges
// them into a single picker for clarity (decision §25). Day clamps to the
// last day of the start month so the date is always valid.
function composeFirstDueDate(startPeriod: string, dueDay: string): string {
  if (!/^\d{4}-\d{2}$/.test(startPeriod)) return '';
  const day = Number(dueDay);
  if (!Number.isInteger(day) || day < 1 || day > 31) return '';
  const [yStr, mStr] = startPeriod.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  // `new Date(year, month, 0)` returns the last day of `month` because month
  // is 0-indexed in Date constructor — passing month=2 with day=0 yields
  // "Feb 28/29".
  const lastDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return `${startPeriod}-${String(safeDay).padStart(2, '0')}`;
}

// Inverse of composeFirstDueDate. Given a picked YYYY-MM-DD, decompose into
// the form's two fields. The picked day becomes due_day verbatim — if a user
// wants `due_day = 31` (end-of-month-with-clamping) they must pick a date in
// a 31-day month. This is documented in the form's helper text.
function decomposeFirstDueDate(picked: string): {
  startPeriod: string;
  dueDay: string;
} | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(picked)) return null;
  return {
    startPeriod: picked.slice(0, 7),
    dueDay: String(Number(picked.slice(8, 10))),
  };
}

// Returns the cadence step in months for the form's current frequency.
// Mirrors stepMonths() in /logic/periods.ts. Returns null when frequency is
// custom and intervalMonths is invalid — the form already surfaces that error
// on the interval field itself.
function cadenceStepMonths(
  frequency: FrequencyOption,
  intervalMonths: string,
): number | null {
  switch (frequency) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'yearly':
      return 12;
    case 'custom': {
      const n = Number(intervalMonths);
      if (!Number.isInteger(n) || n <= 0) return null;
      return n;
    }
    default:
      return null;
  }
}

// Parse a YYYY-MM period string into a Date pinned to the 1st of that month.
// Returns null on malformed input. Local to the form file; mirrors the pattern
// in /logic/periods.ts (periodToDate).
function periodStringToDate(period: string): Date | null {
  if (!/^\d{4}-\d{2}$/.test(period)) return null;
  const d = parseDateFns(period, 'yyyy-MM', new Date(0));
  return isValidDateFns(d) ? d : null;
}

// Compute end_period (YYYY-MM) from start_period + N periods at the given
// cadence step. N=1 means a single-payment bill (end_period === start_period).
// Returns null on malformed input.
function computeEndPeriod(
  startPeriod: string,
  step: number,
  n: number,
): string | null {
  if (!Number.isInteger(n) || n < 1) return null;
  if (!Number.isInteger(step) || step <= 0) return null;
  const start = periodStringToDate(startPeriod);
  if (!start) return null;
  const end = addMonths(start, (n - 1) * step);
  return formatDateFns(end, 'yyyy-MM');
}

// Inverse of computeEndPeriod. Returns N (>= 1) such that
//   start_period + (N - 1) * step === end_period.
// Returns null when end_period is before start_period, when months between
// don't divide evenly into the cadence step, or when inputs are malformed.
function countPeriodsBetween(
  startPeriod: string,
  endPeriod: string,
  step: number,
): number | null {
  if (!Number.isInteger(step) || step <= 0) return null;
  const start = periodStringToDate(startPeriod);
  const end = periodStringToDate(endPeriod);
  if (!start || !end) return null;
  const diff = differenceInCalendarMonths(end, start);
  if (diff < 0) return null;
  if (diff % step !== 0) return null;
  return diff / step + 1;
}

function emptyForm(today: Date): FormState {
  return {
    name: '',
    expectedAmount: null,
    frequency: 'monthly',
    intervalMonths: '',
    dueDay: '15',
    startPeriod: todayPeriodString(today),
    defaultWalletId: null,
    reminderOffsetDays: '3',
    reminderTime: '08:00',
    autoForecast: false,
    endsMode: 'never',
    endsN: '',
  };
}

function billToForm(bill: Bill): FormState {
  const frequency = bill.frequency as FrequencyOption;
  const intervalMonths =
    typeof bill.interval_months === 'number' ? String(bill.interval_months) : '';

  // Derive endsMode/endsN from end_period. Malformed cases (custom with
  // invalid interval, end_period < start_period, or off-cadence end_period)
  // fall back to 'never' so the user can re-pick rather than seeing a
  // confusing pre-filled state.
  let endsMode: EndsMode = 'never';
  let endsN = '';
  if (bill.end_period) {
    const step = cadenceStepMonths(frequency, intervalMonths);
    if (step !== null) {
      const n = countPeriodsBetween(bill.start_period, bill.end_period, step);
      if (n !== null && n >= 1) {
        endsMode = 'after_n';
        endsN = String(n);
      }
    }
  }

  return {
    name: bill.name,
    expectedAmount: bill.expected_amount,
    frequency,
    intervalMonths,
    dueDay: String(bill.due_day),
    startPeriod: bill.start_period,
    defaultWalletId: bill.default_wallet_id,
    reminderOffsetDays: String(bill.reminder_offset_days),
    reminderTime: bill.reminder_time,
    autoForecast: bill.auto_forecast,
    endsMode,
    endsN,
  };
}

function validate(form: FormState): {
  errors: FieldErrors;
  payload: BillInsert | null;
} {
  const errors: FieldErrors = {};

  const name = form.name.trim();
  if (!name) errors.name = 'Name is required.';

  if (form.expectedAmount === null || form.expectedAmount < 0) {
    errors.expectedAmount = 'Enter a valid amount.';
  }

  let intervalMonths: number | null = null;
  if (form.frequency === 'custom') {
    const n = Number(form.intervalMonths);
    if (!Number.isInteger(n) || n < 1) {
      errors.intervalMonths = 'Enter an interval of 1 or more months.';
    } else {
      intervalMonths = n;
    }
  }

  const dueDay = Number(form.dueDay);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    errors.dueDay = 'Due day must be between 1 and 31.';
  }

  if (!/^\d{4}-\d{2}$/.test(form.startPeriod)) {
    errors.startPeriod = 'Pick a first due-month.';
  }

  if (!form.defaultWalletId) {
    errors.defaultWalletId = 'Pick a default wallet.';
  }

  const offset = Number(form.reminderOffsetDays);
  if (!Number.isInteger(offset) || offset < 0) {
    errors.reminderOffsetDays = 'Enter 0 or more days.';
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.reminderTime)) {
    errors.reminderTime = 'Use 24-hour HH:MM (e.g. 08:00).';
  }

  // Resolve end_period from the "Ends" picker. When mode = 'never', the
  // payload carries null (unbounded). When mode = 'after_n', N must be a
  // positive integer; the end-month is computed from start + (N - 1) * step.
  // If the user has frequency = custom with an invalid interval, the interval
  // error is already shown — skip the redundant endsN error.
  let endPeriod: string | null = null;
  if (form.endsMode === 'after_n') {
    const n = Number(form.endsN);
    if (!Number.isInteger(n) || n < 1) {
      errors.endsN = 'Enter a count of 1 or more.';
    } else {
      const step = cadenceStepMonths(form.frequency, form.intervalMonths);
      if (step !== null && /^\d{4}-\d{2}$/.test(form.startPeriod)) {
        endPeriod = computeEndPeriod(form.startPeriod, step, n);
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors, payload: null };
  }

  // All required fields are valid here.
  const payload: BillInsert = {
    name,
    expected_amount: form.expectedAmount as number,
    frequency: form.frequency,
    interval_months: intervalMonths,
    due_day: dueDay,
    start_period: form.startPeriod,
    end_period: endPeriod,
    default_wallet_id: form.defaultWalletId as string,
    reminder_offset_days: offset,
    reminder_time: form.reminderTime,
    auto_forecast: form.autoForecast,
    archived: false,
  };
  return { errors, payload };
}

export default function BillEditScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const router = useRouter();
  const { id: rawId, onboarding: rawOnboarding } = useLocalSearchParams<{
    id: string;
    onboarding?: string;
  }>();
  const id = typeof rawId === 'string' ? rawId : '';
  const isNew = id === 'new';
  // When the form is launched from the onboarding flow we land on the Bills
  // tab after save/skip and flip the persisted onboarding flag, instead of
  // popping back into the onboarding screen. The query-param wiring lets the
  // form stay agnostic to its caller in every other case.
  const fromOnboarding = rawOnboarding === '1';

  const today = useMemo(() => new Date(), []);

  const [form, setForm] = useState<FormState>(() => emptyForm(today));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [wallets, setWallets] = useState<Wallet[] | null>(null);
  const [walletError, setWalletError] = useState<Error | null>(null);

  // Load wallets for the picker.
  useEffect(() => {
    let cancelled = false;
    listWallets(db, {})
      .then((rows) => {
        if (cancelled) return;
        setWallets(rows);
        // Default-pick the first wallet for new bills if none chosen yet.
        if (isNew && rows.length > 0) {
          setForm((f) => (f.defaultWalletId ? f : { ...f, defaultWalletId: rows[0].id }));
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setWalletError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [db, isNew]);

  // Load existing bill for edit mode.
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    getBillById(db, id)
      .then((bill) => {
        if (cancelled) return;
        if (!bill) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setForm(billToForm(bill));
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
        await createBill(db, payload);
      } else {
        await updateBill(db, id, payload);
      }
      if (fromOnboarding) {
        setOnboardingCompleted(true);
        router.replace('/(tabs)/bills');
      } else {
        router.back();
      }
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Cancel from the onboarding flow completes onboarding too — the user is
  // explicitly opting to add a bill later. Otherwise pop back to the
  // previous screen, falling back to the Bills tab when there's nothing
  // to pop (e.g. the user opened /bills/new in a fresh tab and history
  // is empty — `router.back()` is a no-op in that case on web).
  function handleCancel() {
    if (fromOnboarding) {
      setOnboardingCompleted(true);
      router.replace('/(tabs)/bills');
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/bills');
    }
  }

  function handleDelete() {
    showConfirm(
      'Delete bill?',
      'This archives the bill — past payments stay in your history but the bill no longer appears in your list. You can restore it from Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveBill(db, id);
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
            Bill not found.
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={8} style={{ marginTop: theme.spacing.md }}>
            <Text style={[theme.typography.body.sm, { color: theme.colors.accent }]}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={[theme.typography.body.md, { color: theme.colors.textMuted }]}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={handleCancel} hitSlop={8}>
          <Text style={[theme.typography.body.sm, { color: theme.colors.accent }]}>
            {fromOnboarding ? 'Skip' : 'Cancel'}
          </Text>
        </Pressable>
        <Text style={[theme.typography.title.sm, { color: theme.colors.text }]}>
          {isNew ? 'Add bill' : 'Edit bill'}
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
            <View style={[styles.errorBanner, { borderColor: theme.colors.danger }]}>
              <Text style={[theme.typography.body.sm, { color: theme.colors.danger }]}>
                {submitError}
              </Text>
            </View>
          ) : null}

          {walletError ? (
            <View style={[styles.errorBanner, { borderColor: theme.colors.danger }]}>
              <Text style={[theme.typography.body.sm, { color: theme.colors.danger }]}>
                Failed to load wallets: {walletError.message}
              </Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <TextField
              label="Name"
              value={form.name}
              onChangeText={(v) => set('name', v)}
              placeholder="e.g. Globe Internet"
              error={errors.name ?? null}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <CurrencyInput
              label="Expected amount"
              value={form.expectedAmount}
              onChange={(v) => set('expectedAmount', v)}
              error={errors.expectedAmount ?? null}
            />
          </View>

          <View style={styles.field}>
            <SegmentedChips
              label="Frequency"
              options={FREQUENCY_OPTIONS}
              value={form.frequency}
              onChange={(v) => set('frequency', v)}
            />
          </View>

          {form.frequency === 'custom' ? (
            <View style={styles.field}>
              <TextField
                label="Interval (months)"
                value={form.intervalMonths}
                onChangeText={(v) => set('intervalMonths', v.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 2 for bi-monthly"
                keyboardType="number-pad"
                error={errors.intervalMonths ?? null}
              />
            </View>
          ) : null}

          <View style={styles.field}>
            <DateInput
              label="First due date"
              value={composeFirstDueDate(form.startPeriod, form.dueDay)}
              onChange={(picked) => {
                const parts = decomposeFirstDueDate(picked);
                if (!parts) return;
                setForm((f) => ({
                  ...f,
                  startPeriod: parts.startPeriod,
                  dueDay: parts.dueDay,
                }));
                if (errors.startPeriod || errors.dueDay) {
                  setErrors((e) => ({
                    ...e,
                    startPeriod: undefined,
                    dueDay: undefined,
                  }));
                }
              }}
              displayFormat="MMM d, yyyy"
              error={errors.startPeriod ?? errors.dueDay ?? null}
            />
            <Text
              style={[
                theme.typography.label.sm,
                {
                  color: theme.colors.textMuted,
                  marginTop: theme.spacing.xs,
                },
              ]}
            >
              The bill repeats from this date based on the frequency. To set
              an end-of-month bill (e.g. always the 31st, clamped in shorter
              months), pick a 31-day month for the first due date.
            </Text>
          </View>

          <View style={styles.field}>
            <SegmentedChips
              label="Ends"
              options={ENDS_OPTIONS}
              value={form.endsMode}
              onChange={(v) => set('endsMode', v)}
            />
            {form.endsMode === 'after_n' ? (
              <View style={{ marginTop: theme.spacing.md }}>
                <TextField
                  label="Number of periods"
                  value={form.endsN}
                  onChangeText={(v) => set('endsN', v.replace(/[^0-9]/g, ''))}
                  placeholder="e.g. 6"
                  keyboardType="number-pad"
                  error={errors.endsN ?? null}
                />
                {(() => {
                  // Inline helper lines: resolved last-payment month and
                  // total amount across the N periods. Both are derived from
                  // current form state — when the user toggles frequency or
                  // edits N, these recompute automatically. We hide both
                  // lines on malformed N (the error message takes the slot)
                  // or when the step is indeterminate.
                  const n = Number(form.endsN);
                  if (!Number.isInteger(n) || n < 1) return null;
                  const step = cadenceStepMonths(
                    form.frequency,
                    form.intervalMonths,
                  );
                  if (step === null) return null;
                  const endPeriod = computeEndPeriod(form.startPeriod, step, n);
                  if (!endPeriod) return null;
                  const endDate = periodStringToDate(endPeriod);
                  if (!endDate) return null;
                  const lastPaymentLabel = `Last payment: ${formatDateFns(endDate, 'MMM yyyy')}`;
                  const showTotal =
                    typeof form.expectedAmount === 'number' &&
                    form.expectedAmount !== null;
                  const totalLabel = showTotal
                    ? `Total amount: ${formatCurrency(n * (form.expectedAmount as number))}`
                    : null;
                  return (
                    <View style={{ marginTop: theme.spacing.xs }}>
                      <Text
                        style={[
                          theme.typography.label.sm,
                          { color: theme.colors.textMuted },
                        ]}
                      >
                        {lastPaymentLabel}
                      </Text>
                      {totalLabel ? (
                        <Text
                          style={[
                            theme.typography.label.sm,
                            {
                              color: theme.colors.textMuted,
                              marginTop: 2,
                            },
                          ]}
                        >
                          {totalLabel}
                        </Text>
                      ) : null}
                    </View>
                  );
                })()}
              </View>
            ) : null}
          </View>

          <View style={styles.field}>
            {wallets ? (
              <WalletPicker
                label="Default wallet"
                wallets={wallets}
                selectedId={form.defaultWalletId}
                onSelect={(walletId) => set('defaultWalletId', walletId)}
                error={errors.defaultWalletId ?? null}
              />
            ) : (
              <Text style={[theme.typography.body.sm, { color: theme.colors.textMuted }]}>
                Loading wallets…
              </Text>
            )}
          </View>

          <View style={styles.field}>
            <TextField
              label="Reminder offset (days before due)"
              value={form.reminderOffsetDays}
              onChangeText={(v) => set('reminderOffsetDays', v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              error={errors.reminderOffsetDays ?? null}
            />
          </View>

          <View style={styles.field}>
            <TimeInput
              label="Reminder time"
              value={form.reminderTime}
              onChange={(v) => set('reminderTime', v)}
              error={errors.reminderTime ?? null}
            />
          </View>

          <View style={[styles.field, styles.switchRow]}>
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.body.md, { color: theme.colors.text }]}>
                Auto-forecast
              </Text>
              <Text
                style={[
                  theme.typography.label.sm,
                  { color: theme.colors.textMuted, marginTop: 2 },
                ]}
              >
                Use the rolling average of the last 3 actuals as the forecast for future periods.
              </Text>
            </View>
            <Switch
              value={form.autoForecast}
              onValueChange={(v) => set('autoForecast', v)}
              accessibilityLabel="Auto-forecast"
            />
          </View>

          {!isNew ? (
            <View style={[styles.field, { marginTop: theme.spacing.xl }]}>
              <Pressable
                onPress={handleDelete}
                accessibilityRole="button"
                style={[styles.dangerButton, { borderColor: theme.colors.danger }]}
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
                  Delete bill
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
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
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

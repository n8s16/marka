// Payment details modal — shows the BillPayment for a bill's current period.
//
// Route: `/bills/<id>/payment-details?period=<YYYY-MM>`. Opened by tapping
// a paid bill row on the Bills tab; for unpaid rows the same tap opens
// `mark-paid` instead. The split prevents the accidental-double-payment
// trap surfaced during milestone testing — see decision 24 in DECISIONS.md
// and the "Tapping a paid bill" entry in PRD.md §"Behavior decisions".
//
// Modal presentation is owned by the parent layout
// `app/bills/[id]/_layout.tsx`. This screen does NOT declare its own
// `<Stack.Screen>` options.
//
// Single action: "Undo this payment" → confirmation Alert →
// `hardDeleteBillPayment`. There is no Edit affordance in v1; the user
// fixes a typo'd amount by undoing and re-marking.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { format as formatDateFns, parseISO } from 'date-fns';

import { useDb } from '@/db/client';
import { getBillById, type Bill } from '@/db/queries/bills';
import {
  getBillPaymentByBillAndPeriod,
  hardDeleteBillPayment,
  type BillPayment,
} from '@/db/queries/bill-payments';
import { getWalletById, type Wallet } from '@/db/queries/wallets';
import { formatCurrency } from '@/logic/currency';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

function formatPeriodLabel(period: string): string {
  if (!/^\d{4}-\d{2}$/.test(period)) return period;
  return formatDateFns(parseISO(`${period}-01`), 'MMMM yyyy');
}

function formatDateLabel(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return formatDateFns(parseISO(date), 'MMMM d, yyyy');
}

export default function PaymentDetailsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const router = useRouter();
  const { id: rawId, period: rawPeriod } = useLocalSearchParams<{
    id: string;
    period: string;
  }>();
  const id = typeof rawId === 'string' ? rawId : '';
  const period = typeof rawPeriod === 'string' ? rawPeriod : '';

  const [bill, setBill] = useState<Bill | null>(null);
  const [payment, setPayment] = useState<BillPayment | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const billRow = await getBillById(db, id);
        if (cancelled) return;
        if (!billRow) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const paymentRow = await getBillPaymentByBillAndPeriod(db, id, period);
        if (cancelled) return;
        if (!paymentRow) {
          // Race: payment was undone in another tab/screen between Bills-tap
          // and modal-mount. Surface "not found" rather than silently
          // showing stale data.
          setNotFound(true);
          setLoading(false);
          return;
        }
        const walletRow = await getWalletById(db, paymentRow.wallet_id);
        if (cancelled) return;
        setBill(billRow);
        setPayment(paymentRow);
        setWallet(walletRow ?? null);
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
  }, [db, id, period]);

  function handleUndo() {
    if (!payment || !bill) return;
    Alert.alert(
      'Undo this payment?',
      `This removes the ${formatPeriodLabel(period)} payment for ${bill.name} (${formatCurrency(payment.amount)}). The bill will appear unpaid for that period.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await hardDeleteBillPayment(db, payment.id);
              router.back();
            } catch (err) {
              Alert.alert('Could not undo', (err as Error).message);
              setDeleting(false);
            }
          },
        },
      ],
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

  if (notFound || !bill || !payment) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text
            style={[theme.typography.body.md, { color: theme.colors.text }]}
          >
            Payment not found.
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

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text
            style={[theme.typography.body.sm, { color: theme.colors.accent }]}
          >
            Close
          </Text>
        </Pressable>
        <Text style={[theme.typography.title.sm, { color: theme.colors.text }]}>
          Payment details
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loadError ? (
          <View style={[styles.errorBanner, { borderColor: theme.colors.danger }]}>
            <Text
              style={[theme.typography.body.sm, { color: theme.colors.danger }]}
            >
              {loadError}
            </Text>
          </View>
        ) : null}

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
            {formatPeriodLabel(period)}
          </Text>
        </View>

        <View style={styles.amountBlock}>
          <Text
            style={[theme.typography.label.md, { color: theme.colors.textMuted }]}
          >
            Amount
          </Text>
          <Text
            style={[
              theme.typography.title.md,
              { color: theme.colors.text, marginTop: 4 },
            ]}
          >
            {formatCurrency(payment.amount)}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text
            style={[theme.typography.label.md, { color: theme.colors.textMuted }]}
          >
            Wallet
          </Text>
          <Text
            style={[theme.typography.body.md, { color: theme.colors.text }]}
          >
            {wallet?.name ?? 'Unknown wallet'}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text
            style={[theme.typography.label.md, { color: theme.colors.textMuted }]}
          >
            Paid on
          </Text>
          <Text
            style={[theme.typography.body.md, { color: theme.colors.text }]}
          >
            {formatDateLabel(payment.paid_date)}
          </Text>
        </View>

        {payment.note ? (
          <View style={styles.noteBlock}>
            <Text
              style={[
                theme.typography.label.md,
                { color: theme.colors.textMuted },
              ]}
            >
              Note
            </Text>
            <Text
              style={[
                theme.typography.body.md,
                { color: theme.colors.text, marginTop: 4 },
              ]}
            >
              {payment.note}
            </Text>
          </View>
        ) : null}

        <View style={{ height: theme.spacing.xxl }} />

        <Pressable
          onPress={handleUndo}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityLabel="Undo this payment"
          style={({ pressed }) => [
            styles.undoButton,
            {
              backgroundColor: pressed
                ? theme.colors.surfaceMuted
                : theme.colors.surface,
              borderColor: theme.colors.danger,
              opacity: deleting ? theme.opacity.disabled : 1,
            },
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
            {deleting ? 'Undoing…' : 'Undo this payment'}
          </Text>
        </Pressable>
      </ScrollView>
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
    headerSpacer: { width: 48 },
    scrollContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xxxl,
    },
    summary: { marginBottom: theme.spacing.xl },
    amountBlock: {
      paddingVertical: theme.spacing.lg,
      borderTopWidth: theme.borderWidth.hairline,
      borderColor: theme.colors.border,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: theme.spacing.md,
      borderTopWidth: theme.borderWidth.hairline,
      borderColor: theme.colors.border,
    },
    noteBlock: {
      paddingVertical: theme.spacing.md,
      borderTopWidth: theme.borderWidth.hairline,
      borderColor: theme.colors.border,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    undoButton: {
      borderWidth: theme.borderWidth.hairline,
      borderRadius: theme.radii.sm,
      paddingVertical: theme.spacing.md,
      alignItems: 'center',
    },
    errorBanner: {
      borderWidth: theme.borderWidth.hairline,
      borderRadius: theme.radii.sm,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.lg,
    },
  });
}

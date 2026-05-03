// Manage bills list screen.
//
// Route: `/settings/bills`. Reachable from the Settings hub.
// Per docs/PRD.md §"Supporting screens" — Settings (manage bills), this
// screen lists all bills (active + archived) with edit-on-tap and a FAB
// to add a new one. The add and edit forms are reused from
// `app/bills/[id]/index.tsx` — there is exactly one bill form, and both
// `/bills/new` and `/bills/<uuid>` route through it.
//
// Layout mirrors `app/settings/wallets/index.tsx` exactly: SafeAreaView
// root, header with Back link + centered title, ScrollView body with
// hairline-bordered Active and Archived cards, FAB at bottom-right.
//
// Sort: Active and Archived are both sorted by name ascending
// (case-insensitive). The Bills tab uses creation order; this management
// screen sorts alphabetically because the user is here to find a specific
// bill, not to see what they added recently.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { useDb } from '@/db/client';
import { listBills, type Bill } from '@/db/queries/bills';
import { listWallets, type Wallet } from '@/db/queries/wallets';
import { formatCurrency } from '@/logic/currency';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';
import { accentColorFor } from '@/utils/wallet-color';

// Frequency sub-label rules (per PR brief):
//   monthly   → "Monthly"
//   quarterly → "Quarterly"
//   yearly    → "Yearly"
//   custom    → "Custom · every N months" (singular "month" when N === 1)
function formatFrequency(bill: Bill): string {
  switch (bill.frequency) {
    case 'monthly':
      return 'Monthly';
    case 'quarterly':
      return 'Quarterly';
    case 'yearly':
      return 'Yearly';
    case 'custom': {
      const n = bill.interval_months ?? 0;
      const unit = n === 1 ? 'month' : 'months';
      return `Custom · every ${n} ${unit}`;
    }
  }
}

interface BillRowProps {
  bill: Bill;
  walletColor: string;
  onPress: (id: string) => void;
  isLast: boolean;
}

function BillRow({ bill, walletColor, onPress, isLast }: BillRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeRowStyles(theme), [theme]);

  return (
    <Pressable
      onPress={() => onPress(bill.id)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${bill.name}`}
      style={({ pressed }) => [
        styles.row,
        !isLast && {
          borderBottomWidth: theme.borderWidth.hairline,
          borderBottomColor: theme.colors.border,
        },
        pressed && { backgroundColor: theme.colors.surfaceMuted },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: walletColor }]} />
      <View style={styles.rowText}>
        <Text
          style={[theme.typography.body.md, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          {bill.name}
        </Text>
        <Text
          style={[
            theme.typography.label.sm,
            { color: theme.colors.textMuted, marginTop: 2 },
          ]}
        >
          {formatFrequency(bill)}
        </Text>
      </View>
      <Text
        style={[theme.typography.body.sm, { color: theme.colors.textMuted }]}
      >
        {formatCurrency(bill.expected_amount)}
      </Text>
    </Pressable>
  );
}

export default function ManageBillsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Wallets fetched with includeArchived so historical refs always resolve.
    Promise.all([
      listBills(db, { includeArchived: true }),
      listWallets(db, { includeArchived: true }),
    ])
      .then(([billRows, walletRows]) => {
        if (!cancelled) {
          setBills(billRows);
          setWallets(walletRows);
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

  // Reload on focus so changes from the bill edit screen reflect when
  // returning here. listBills + listWallets are cheap at this scale.
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

  const walletsById = useMemo(() => {
    const map = new Map<string, Wallet>();
    for (const w of wallets) map.set(w.id, w);
    return map;
  }, [wallets]);

  const { active, archived } = useMemo(() => {
    const cmp = (a: Bill, b: Bill) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    const a: Bill[] = [];
    const ar: Bill[] = [];
    for (const b of bills) {
      if (b.archived) ar.push(b);
      else a.push(b);
    }
    a.sort(cmp);
    ar.sort(cmp);
    return { active: a, archived: ar };
  }, [bills]);

  function handleRowPress(id: string) {
    router.push({
      pathname: '/bills/[id]',
      params: { id },
    });
  }

  function handleAdd() {
    router.push({
      pathname: '/bills/[id]',
      params: { id: 'new' },
    });
  }

  function colorForBill(b: Bill): string {
    const w = walletsById.get(b.default_wallet_id);
    return accentColorFor(w) ?? theme.walletBrand.fallback;
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
            Bills
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
              Failed to load bills: {error.message}
            </Text>
          </View>
        ) : bills.length === 0 ? (
          <View style={styles.empty}>
            <Text
              style={[
                theme.typography.body.md,
                { color: theme.colors.textMuted, textAlign: 'center' },
              ]}
            >
              No bills yet — tap + to add one.
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
                  {active.map((b, i) => (
                    <BillRow
                      key={b.id}
                      bill={b}
                      walletColor={colorForBill(b)}
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
                {/* Archived bills visually recede via opacity — same paid-row
                    metaphor used elsewhere. Tap still works so the user can
                    unarchive from the edit screen. */}
                <View style={[styles.card, { opacity: theme.opacity.paid }]}>
                  {archived.map((b, i) => (
                    <BillRow
                      key={b.id}
                      bill={b}
                      walletColor={colorForBill(b)}
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
          accessibilityLabel="Add a bill"
          hitSlop={8}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: theme.colors.accent,
              opacity: pressed ? theme.opacity.muted : 1,
            },
          ]}
        >
          <Ionicons name="add" size={28} color={theme.colors.bg} />
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
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    rowText: {
      flex: 1,
    },
  });
}

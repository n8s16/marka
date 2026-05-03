// Transfers history screen.
//
// Route: `/transfers`. Reachable from the Wallets tab's "View transfers"
// link. Per docs/PRD.md §"Supporting screens" — Transfers history and
// DECISIONS §26, this is an all-time chronological list of transfers
// grouped by date, with each row tappable to open the edit form.
//
// Why all-time, not current-month: transfers are infrequent (you don't
// transfer between wallets daily). A month-only filter would frequently
// render empty. The list scrolls fine until volumes get large; a date
// filter can be added later.
//
// Layout mirrors the Spending tab — header with title, ScrollView with
// date-grouped sections, FAB at bottom-right routing to /transfers/new.
// Data fetching lives in `state/transfers-history.ts`.

import { useMemo } from 'react';
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
import { useRouter } from 'expo-router';
import {
  format as formatDate,
  isSameDay,
  parseISO,
  subDays,
} from 'date-fns';

import { TransferRow } from '@/components/transfer-row';
import { useDb } from '@/db/client';
import type { Transfer } from '@/db/queries/transfers';
import { useTransfersHistory } from '@/state/transfers-history';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

interface DateGroup {
  date: string; // YYYY-MM-DD
  label: string; // pre-formatted heading
  transfers: Transfer[];
}

function groupTransfersByDate(
  transfers: Transfer[],
  today: Date,
): DateGroup[] {
  const yesterday = subDays(today, 1);
  const groups: DateGroup[] = [];
  let current: DateGroup | null = null;

  for (const t of transfers) {
    if (!current || current.date !== t.date) {
      const parsed = parseISO(t.date);
      let label: string;
      if (!Number.isNaN(parsed.getTime()) && isSameDay(parsed, today)) {
        label = 'Today';
      } else if (
        !Number.isNaN(parsed.getTime()) &&
        isSameDay(parsed, yesterday)
      ) {
        label = 'Yesterday';
      } else if (Number.isNaN(parsed.getTime())) {
        label = t.date;
      } else {
        label = formatDate(parsed, 'EEE, MMM d, yyyy');
      }
      current = { date: t.date, label, transfers: [] };
      groups.push(current);
    }
    current.transfers.push(t);
  }
  return groups;
}

export default function TransfersHistoryScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const router = useRouter();

  const today = useMemo(() => new Date(), []);

  const { loading, error, transfers, walletsById } = useTransfersHistory(db);

  const groups = useMemo(
    () => groupTransfersByDate(transfers, today),
    [transfers, today],
  );

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
            Transfers
          </Text>
          {/* Spacer so the title centers visually opposite the Back link. */}
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.text} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text
              style={[theme.typography.body.sm, { color: theme.colors.danger }]}
            >
              Failed to load transfers: {error.message}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {transfers.length === 0 ? (
              <View style={styles.empty}>
                <Text
                  style={[
                    theme.typography.body.md,
                    {
                      color: theme.colors.textMuted,
                      textAlign: 'center',
                    },
                  ]}
                >
                  No transfers yet. Tap + to record one.
                </Text>
              </View>
            ) : (
              groups.map((group) => (
                <View key={group.date} style={styles.group}>
                  <Text
                    style={[
                      theme.typography.label.md,
                      styles.groupHeader,
                      { color: theme.colors.textFaint },
                    ]}
                  >
                    {group.label}
                  </Text>
                  <View style={styles.list}>
                    {group.transfers.map((t) => (
                      <TransferRow
                        key={t.id}
                        transfer={t}
                        fromWallet={walletsById.get(t.from_wallet_id)}
                        toWallet={walletsById.get(t.to_wallet_id)}
                      />
                    ))}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* Floating + button — secondary entry point for recording a
            transfer (the primary is the Wallets tab "Record a transfer"
            link). Both route to the same /transfers/new screen. */}
        <Pressable
          onPress={() => router.push('/transfers/new')}
          accessibilityRole="button"
          accessibilityLabel="Record a transfer"
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
    scrollContent: { paddingBottom: theme.spacing.xxxl },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.xxl,
      paddingVertical: theme.spacing.xxxl,
    },
    group: {
      marginBottom: theme.spacing.md,
    },
    groupHeader: {
      textTransform: 'uppercase',
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.xs,
    },
    list: {
      marginHorizontal: theme.spacing.lg,
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

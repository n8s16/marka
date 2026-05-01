// Manage wallets list screen.
//
// Route: `/settings/wallets`. Reachable from the Settings hub.
// Per docs/PRD.md §"Supporting screens" — Manage wallets, this screen
// lists all wallets (active + archived) with edit-on-tap and an FAB to
// add a new wallet. The show-balance toggle and opening-balance flow
// described in the PRD line for this screen are intentionally deferred
// to step 11 (Optional balance toggle on wallets).
//
// Layout mirrors `app/transfers/index.tsx`: SafeAreaView root, header
// with Back link + centered title, ScrollView body, FAB at bottom-right.
//
// Sections render as separate hairline-bordered cards. Each section
// (and its header) hides when empty so a fresh install with no archived
// wallets shows only the Active card.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { useDb } from '@/db/client';
import { listWallets, type Wallet } from '@/db/queries/wallets';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';
import { accentColorFor } from '@/utils/wallet-color';

const TYPE_LABEL: Record<Wallet['type'], string> = {
  e_wallet: 'E-wallet',
  bank: 'Bank',
  cash: 'Cash',
};

interface WalletRowProps {
  wallet: Wallet;
  onPress: (id: string) => void;
  isLast: boolean;
}

function WalletRow({ wallet, onPress, isLast }: WalletRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeRowStyles(theme), [theme]);
  const accent = accentColorFor(wallet) ?? theme.walletBrand.fallback;

  return (
    <Pressable
      onPress={() => onPress(wallet.id)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${wallet.name}`}
      style={({ pressed }) => [
        styles.row,
        !isLast && {
          borderBottomWidth: theme.borderWidth.hairline,
          borderBottomColor: theme.colors.border,
        },
        pressed && { backgroundColor: theme.colors.surfaceMuted },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <View style={styles.rowText}>
        <Text
          style={[theme.typography.body.md, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          {wallet.name}
        </Text>
        <Text
          style={[
            theme.typography.label.sm,
            { color: theme.colors.textMuted, marginTop: 2 },
          ]}
        >
          {TYPE_LABEL[wallet.type]}
        </Text>
      </View>
      <Text
        style={[theme.typography.body.sm, { color: theme.colors.textFaint }]}
      >
        ›
      </Text>
    </Pressable>
  );
}

export default function ManageWalletsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listWallets(db, { includeArchived: true })
      .then((rows) => {
        if (!cancelled) {
          setWallets(rows);
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

  // Reload on focus so changes from the edit screen reflect when returning
  // here. listWallets is cheap and the wallet table is tiny — no caching
  // layer needed at this scale.
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

  const { active, archived } = useMemo(() => {
    const a: Wallet[] = [];
    const ar: Wallet[] = [];
    for (const w of wallets) {
      if (w.archived) ar.push(w);
      else a.push(w);
    }
    return { active: a, archived: ar };
  }, [wallets]);

  function handleRowPress(id: string) {
    router.push({
      pathname: '/settings/wallets/[id]',
      params: { id },
    });
  }

  function handleAdd() {
    router.push({
      pathname: '/settings/wallets/[id]',
      params: { id: 'new' },
    });
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
            Wallets
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
              Failed to load wallets: {error.message}
            </Text>
          </View>
        ) : wallets.length === 0 ? (
          <View style={styles.empty}>
            <Text
              style={[
                theme.typography.body.md,
                { color: theme.colors.textMuted, textAlign: 'center' },
              ]}
            >
              No wallets yet — tap + to add one.
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
                  {active.map((w, i) => (
                    <WalletRow
                      key={w.id}
                      wallet={w}
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
                {/* Archived wallets visually recede via opacity — same
                    paid-row metaphor used in bill-row. Tap still works
                    so the user can unarchive from the edit screen. */}
                <View style={[styles.card, { opacity: theme.opacity.paid }]}>
                  {archived.map((w, i) => (
                    <WalletRow
                      key={w.id}
                      wallet={w}
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
          accessibilityLabel="Add a wallet"
          hitSlop={8}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: theme.colors.accent,
              opacity: pressed ? theme.opacity.muted : 1,
            },
          ]}
        >
          <Text style={[styles.fabIcon, { color: theme.colors.bg }]}>+</Text>
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
    fabIcon: {
      fontSize: 28,
      lineHeight: 32,
      fontWeight: '500',
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

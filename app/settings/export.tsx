// Settings → Export screen.
//
// Route: `/settings/export`. Reachable from the Settings hub's "Export" row.
// PRD §"Behavior decisions" — Backups: manual export from Settings produces a
// JSON file (full fidelity) or per-table CSVs (for spreadsheets). Both export
// options include archived records.
//
// Layout follows `app/settings/theme.tsx`: SafeAreaView root, header with Back
// link + centered title, hairline-bordered card with two action rows, helper
// text below.
//
// Two flows:
//
//   1. Export as JSON — fetch all six tables (with includeArchived for
//      reference tables), build a single ExportSnapshot, write a single JSON
//      file to the document directory, hand it to the share sheet.
//
//   2. Export as CSV — same fetch, but the snapshot is rendered through
//      `exportToCsv` into six per-table CSVs. We zip them with `jszip`
//      (pure JS, no native deps) into a single archive and share that.
//      This was originally Option A (write to a folder, share the first
//      file, point at the Files app for the rest) but real-device testing
//      surfaced the obvious flaw: most users only saw the first CSV and
//      missed the "go find the others in Files app" alert. One zip, one
//      share, all tables — clean.
//
// On any error: surface inline as red text. Never throws to a global handler.
//
// Note: this screen does NOT load all rows on mount. The fetch happens lazily
// when the user taps an export button — Settings users rarely visit this
// screen, and we don't want to block the page with a spinner for nothing.

import { useMemo, useState } from 'react';
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
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { format } from 'date-fns';
import JSZip from 'jszip';

import { useDb } from '@/db/client';
import { listBillPayments } from '@/db/queries/bill-payments';
import { listBills } from '@/db/queries/bills';
import { listCategories } from '@/db/queries/categories';
import { listExpenses } from '@/db/queries/expenses';
import { listTransfers } from '@/db/queries/transfers';
import { listWallets } from '@/db/queries/wallets';
import {
  exportToCsv,
  exportToJson,
  type ExportSnapshot,
} from '@/logic/export';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

// Tables exported as separate CSV files. The Map iteration order matches the
// schema declaration order in db/schema.ts and is asserted by the unit tests.
const CSV_TABLES = [
  'wallet',
  'bill',
  'category',
  'bill_payment',
  'expense',
  'transfer',
] as const;

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; message: string }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

export default function ExportScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const router = useRouter();
  const db = useDb();

  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const busy = status.kind === 'busy';

  async function buildSnapshot(): Promise<ExportSnapshot> {
    // Fetch all six tables in parallel. Reference tables ask for archived
    // rows explicitly per PRD §"Behavior decisions" — Backups. Event tables
    // have no archived flag so listing them returns everything.
    const [wallets, bills, categories, billPayments, expenses, transfers] =
      await Promise.all([
        listWallets(db, { includeArchived: true }),
        listBills(db, { includeArchived: true }),
        listCategories(db, { includeArchived: true }),
        listBillPayments(db),
        listExpenses(db),
        listTransfers(db),
      ]);
    return {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      wallet: wallets,
      bill: bills,
      category: categories,
      bill_payment: billPayments,
      expense: expenses,
      transfer: transfers,
    };
  }

  async function handleExportJson(): Promise<void> {
    setStatus({ kind: 'busy', message: 'Preparing your data…' });
    try {
      const snapshot = await buildSnapshot();
      const json = exportToJson(snapshot);
      const stamp = format(new Date(), 'yyyy-MM-dd');
      const file = new File(Paths.document, `marka-export-${stamp}.json`);
      // `create` with overwrite:true so re-exporting on the same day doesn't
      // throw on the existing file. The file is replaced cleanly.
      file.create({ overwrite: true });
      file.write(json);
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        setStatus({
          kind: 'success',
          message: `Saved to ${file.uri} — sharing isn't available on this device.`,
        });
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        UTI: 'public.json',
        dialogTitle: 'Export Marka data',
      });
      setStatus({
        kind: 'success',
        message: 'JSON export ready. Choose where to save it.',
      });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: `Export failed: ${describeError(err)}`,
      });
    }
  }

  async function handleExportCsv(): Promise<void> {
    setStatus({ kind: 'busy', message: 'Preparing your data…' });
    try {
      const snapshot = await buildSnapshot();
      const csvs = exportToCsv(snapshot);
      const stamp = format(new Date(), 'yyyy-MM-dd');

      // Zip the six per-table CSVs into a single archive. JSZip is pure
      // JS (no native code) so this works in Expo Go without any native
      // module setup. Output as a Uint8Array so we can hand the bytes
      // straight to expo-file-system's File.write.
      const zip = new JSZip();
      for (const table of CSV_TABLES) {
        const body = csvs.get(table);
        if (body === undefined) continue; // defensive — exportToCsv populates all six
        zip.file(`marka-${table}-${stamp}.csv`, body);
      }
      const zipBytes = await zip.generateAsync({ type: 'uint8array' });

      const file = new File(Paths.document, `marka-csv-${stamp}.zip`);
      file.create({ overwrite: true });
      file.write(zipBytes);

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        setStatus({
          kind: 'success',
          message: `Saved to ${file.uri} — sharing isn't available on this device.`,
        });
        return;
      }

      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/zip',
        UTI: 'public.zip-archive',
        dialogTitle: 'Export Marka data',
      });
      setStatus({
        kind: 'success',
        message: 'CSV export ready (six files inside one zip). Choose where to save it.',
      });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: `Export failed: ${describeError(err)}`,
      });
    }
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
            Export
          </Text>
          {/* Spacer so the title centers visually opposite the Back link. */}
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <ExportRow
              theme={theme}
              title="Export as JSON"
              subtitle="Full fidelity, all tables in one file."
              onPress={handleExportJson}
              disabled={busy}
              isLast={false}
            />
            <ExportRow
              theme={theme}
              title="Export as CSV"
              subtitle="One file per table, ready for spreadsheets."
              onPress={handleExportCsv}
              disabled={busy}
              isLast
            />
          </View>

          {status.kind === 'busy' ? (
            <View style={styles.statusRow}>
              <ActivityIndicator color={theme.colors.text} />
              <Text
                style={[
                  theme.typography.body.sm,
                  styles.statusText,
                  { color: theme.colors.textMuted },
                ]}
              >
                {status.message}
              </Text>
            </View>
          ) : null}

          {status.kind === 'success' ? (
            <Text
              style={[
                theme.typography.body.sm,
                styles.statusText,
                { color: theme.colors.text },
              ]}
            >
              {status.message}
            </Text>
          ) : null}

          {status.kind === 'error' ? (
            <Text
              style={[
                theme.typography.body.sm,
                styles.statusText,
                { color: theme.colors.danger },
              ]}
            >
              {status.message}
            </Text>
          ) : null}

          <Text
            style={[
              theme.typography.body.sm,
              styles.helperText,
              { color: theme.colors.textMuted },
            ]}
          >
            Exports include both active and archived records. Currency amounts
            are stored as integer centavos — divide by 100 to read in pesos.
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

interface ExportRowProps {
  theme: Theme;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled: boolean;
  isLast: boolean;
}

function ExportRow({
  theme,
  title,
  subtitle,
  onPress,
  disabled,
  isLast,
}: ExportRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        rowStyles.row,
        !isLast && {
          borderBottomWidth: theme.borderWidth.hairline,
          borderBottomColor: theme.colors.border,
        },
        pressed && !disabled && {
          backgroundColor: theme.colors.surfaceMuted,
        },
        disabled && { opacity: theme.opacity.muted },
      ]}
    >
      <View style={rowStyles.rowText}>
        <Text
          style={[theme.typography.body.md, { color: theme.colors.text }]}
        >
          {title}
        </Text>
        <Text
          style={[
            theme.typography.label.sm,
            { color: theme.colors.textMuted, marginTop: 2 },
          ]}
        >
          {subtitle}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.colors.textFaint}
      />
    </Pressable>
  );
}

// Pull a human-readable message off whatever was thrown. Errors come from
// expo-sqlite, expo-file-system, expo-sharing, or our own logic — all of
// them surface a `.message` string in practice. Falls back to a generic
// label if not.
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'unknown error';
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
});

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
    scrollContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.xxxl,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      borderColor: theme.colors.border,
      borderWidth: theme.borderWidth.hairline,
      overflow: 'hidden',
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      marginTop: theme.spacing.md,
      paddingHorizontal: theme.spacing.xs,
    },
    statusText: {
      flexShrink: 1,
      flexWrap: 'wrap',
      marginTop: theme.spacing.md,
      paddingHorizontal: theme.spacing.xs,
    },
    helperText: {
      marginTop: theme.spacing.lg,
      paddingHorizontal: theme.spacing.xs,
    },
  });
}

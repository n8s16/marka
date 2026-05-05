// Settings → Import.
//
// Counterpart to Settings → Export. The user picks a previously
// exported `marka-export-*.json` file; we parse it, show a row-count
// confirmation, and on a typed-confirm REPLACE we wipe the database
// and re-insert the snapshot.
//
// Replace-all semantics for v1 — no merge, no row-by-row reconciliation.
// Mirrors the mental model of Reset (which the user is already used to).
//
// File picking on web: we render a hidden `<input type="file">` and
// click it programmatically when the user taps "Pick a file." The PWA
// target is web-only so this is the right primitive — no expo-document-
// picker needed.
//
// Friction: typed confirm "REPLACE" plus an Alert. Same belt-and-
// suspenders pattern as Reset, since import is also irreversible.

import { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { showConfirm } from '@/utils/confirm';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { TextField } from '@/components/text-field';
import { useDb } from '@/db/client';
import { applyImport } from '@/db/queries/import';
import {
  ImportParseError,
  parseExportJson,
  summariseSnapshot,
} from '@/logic/import';
import type { ExportSnapshot } from '@/logic/export';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

const CONFIRM_TOKEN = 'REPLACE';

export default function SettingsImportScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const router = useRouter();
  const db = useDb();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ExportSnapshot | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [running, setRunning] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const confirmed = confirmText.trim().toUpperCase() === CONFIRM_TOKEN;
  const canImport = !!snapshot && confirmed && !running;

  function handlePickFile() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = e.currentTarget.files?.[0];
    // Reset the input so picking the same filename twice fires onChange.
    e.currentTarget.value = '';
    if (!file) return;

    setParseError(null);
    setImportError(null);
    setSnapshot(null);
    setPickedFileName(file.name);

    try {
      const text = await file.text();
      const parsed = parseExportJson(text);
      setSnapshot(parsed);
    } catch (err) {
      const msg =
        err instanceof ImportParseError
          ? err.message
          : `Could not read file: ${(err as Error).message}`;
      setParseError(msg);
    }
  }

  function handlePressImport() {
    if (!canImport) return;
    showConfirm(
      'Replace all data?',
      'This deletes every wallet, bill, payment, expense, and transfer, then loads the contents of the file. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: () => {
            void runImport();
          },
        },
      ],
    );
  }

  async function runImport() {
    if (!snapshot) return;
    setImportError(null);
    setRunning(true);
    try {
      await applyImport(db, snapshot);
      // No need to bounce through `/` like Reset — the persisted
      // onboarding flag stays true, so the user already has wallets
      // and lands back in Settings as expected.
      router.back();
    } catch (err) {
      setImportError((err as Error).message);
      setRunning(false);
    }
  }

  const summary = snapshot ? summariseSnapshot(snapshot) : null;

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <Text style={[theme.typography.body.sm, { color: theme.colors.accent }]}>
            Back
          </Text>
        </Pressable>
        <Text style={[theme.typography.title.sm, { color: theme.colors.text }]}>
          Import
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Hidden file input — clicked programmatically by the Pick
          button below. accept restricts to .json so the iOS Files
          picker filters appropriately. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text
              style={[
                theme.typography.body.md,
                { color: theme.colors.text, fontWeight: theme.typography.weights.medium },
              ]}
            >
              Restore from a Marka JSON export
            </Text>
            <Text
              style={[
                theme.typography.body.sm,
                styles.body,
                { color: theme.colors.textMuted },
              ]}
            >
              Pick a file you previously saved from Settings → Export.
              The current data on this device will be replaced with the
              file&rsquo;s contents.
            </Text>
          </View>

          <Pressable
            onPress={handlePickFile}
            disabled={running}
            accessibilityRole="button"
            accessibilityLabel="Pick a file"
            style={({ pressed }) => [
              styles.pickButton,
              {
                borderColor: theme.colors.accent,
                opacity: pressed ? theme.opacity.muted : 1,
              },
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
              {pickedFileName ? 'Pick a different file' : 'Pick a file'}
            </Text>
          </Pressable>

          {pickedFileName ? (
            <Text
              style={[
                theme.typography.label.sm,
                styles.fileName,
                { color: theme.colors.textMuted },
              ]}
              numberOfLines={1}
            >
              {pickedFileName}
            </Text>
          ) : null}

          {parseError ? (
            <View
              style={[
                styles.errorBanner,
                { borderColor: theme.colors.danger },
              ]}
            >
              <Text
                style={[theme.typography.body.sm, { color: theme.colors.danger }]}
              >
                Could not read this file: {parseError}
              </Text>
            </View>
          ) : null}

          {summary ? (
            <View
              style={[
                styles.summaryCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text
                style={[
                  theme.typography.label.sm,
                  styles.summaryHeading,
                  { color: theme.colors.textFaint },
                ]}
              >
                THIS FILE CONTAINS
              </Text>
              <SummaryRow label="Wallets" count={summary.wallet} theme={theme} />
              <SummaryRow label="Bills" count={summary.bill} theme={theme} />
              <SummaryRow label="Categories" count={summary.category} theme={theme} />
              <SummaryRow label="Bill payments" count={summary.bill_payment} theme={theme} />
              <SummaryRow label="Expenses" count={summary.expense} theme={theme} />
              <SummaryRow label="Transfers" count={summary.transfer} theme={theme} />
            </View>
          ) : null}

          {snapshot ? (
            <>
              <View style={styles.confirmField}>
                <TextField
                  label={`Type ${CONFIRM_TOKEN} to confirm`}
                  value={confirmText}
                  onChangeText={setConfirmText}
                  placeholder={CONFIRM_TOKEN}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="done"
                />
              </View>

              {importError ? (
                <View
                  style={[
                    styles.errorBanner,
                    { borderColor: theme.colors.danger },
                  ]}
                >
                  <Text
                    style={[theme.typography.body.sm, { color: theme.colors.danger }]}
                  >
                    Import failed: {importError}
                  </Text>
                </View>
              ) : null}

              <Pressable
                onPress={handlePressImport}
                disabled={!canImport}
                accessibilityRole="button"
                accessibilityLabel="Replace data with this file"
                accessibilityState={{ disabled: !canImport }}
                style={({ pressed }) => [
                  styles.importButton,
                  {
                    backgroundColor: theme.colors.danger,
                    opacity: !canImport
                      ? theme.opacity.muted
                      : pressed
                        ? theme.opacity.muted
                        : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    theme.typography.body.md,
                    {
                      color: theme.colors.bg,
                      fontWeight: theme.typography.weights.medium,
                    },
                  ]}
                >
                  {running ? 'Importing…' : 'Replace data with this file'}
                </Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface SummaryRowProps {
  label: string;
  count: number;
  theme: Theme;
}

function SummaryRow({ label, count, theme }: SummaryRowProps) {
  return (
    <View style={summaryRowStyles.row}>
      <Text style={[theme.typography.body.sm, { color: theme.colors.text }]}>
        {label}
      </Text>
      <Text
        style={[
          theme.typography.body.sm,
          { color: theme.colors.textMuted, fontVariant: ['tabular-nums'] },
        ]}
      >
        {count.toLocaleString()}
      </Text>
    </View>
  );
}

const summaryRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
});

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
    headerSpacer: { width: 36 },
    scrollContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xxxl,
    },
    card: {
      borderWidth: 1,
      borderRadius: theme.radii.md,
      padding: theme.spacing.lg,
    },
    body: {
      marginTop: theme.spacing.sm,
    },
    pickButton: {
      marginTop: theme.spacing.lg,
      borderWidth: theme.borderWidth.hairline,
      borderRadius: theme.radii.md,
      paddingVertical: theme.spacing.md,
      alignItems: 'center',
    },
    fileName: {
      marginTop: theme.spacing.sm,
      textAlign: 'center',
    },
    errorBanner: {
      borderWidth: theme.borderWidth.hairline,
      borderRadius: theme.radii.sm,
      padding: theme.spacing.md,
      marginTop: theme.spacing.lg,
    },
    summaryCard: {
      borderWidth: 1,
      borderRadius: theme.radii.md,
      padding: theme.spacing.lg,
      marginTop: theme.spacing.lg,
    },
    summaryHeading: {
      marginBottom: theme.spacing.sm,
      letterSpacing: 1,
    },
    confirmField: {
      marginTop: theme.spacing.xl,
    },
    importButton: {
      marginTop: theme.spacing.xl,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radii.md,
      alignItems: 'center',
    },
  });
}

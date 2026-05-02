// Settings → Reset.
//
// Wipes every row from every table, clears persisted app state
// (onboarding flag, app-lock flag, theme preference), and lands the user
// back on the onboarding flow.
//
// Friction: the user must type `DELETE` (case-insensitive) into a confirm
// field before the destructive button enables. A single Alert is too easy
// to dismiss-with-thumb on a phone, especially when the action is
// irreversible.
//
// Why we re-seed categories inside `clearAllData` rather than relying on
// the DB provider's startup seed: that seed runs once per app session and
// is guarded by a ref, so a mid-session reset would leave the categories
// table empty until the next cold start. Wallets are intentionally NOT
// re-seeded — the onboarding flow re-creates the user's chosen subset.
//
// In-memory Zustand state for `onboarding` and `app-lock` must be reset
// imperatively too: AsyncStorage clearing only affects the next rehydrate,
// not the live store. Theme isn't reset because the user's chosen theme
// surviving a data-wipe is a UX win (they don't get blasted with a
// different mode mid-flow); the AsyncStorage entry IS still cleared, so a
// reinstall starts at "System" again.

import { useMemo, useState } from 'react';
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
import { useRouter, type RelativePathString } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { TextField } from '@/components/text-field';
import { useDb } from '@/db/client';
import { clearAllData } from '@/db/queries/reset';
import { setAppLockEnabled, setAppLockUnlocked } from '@/state/app-lock';
import { setOnboardingCompleted } from '@/state/onboarding';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

const CONFIRM_TOKEN = 'DELETE';
const ROOT_PATH = '/' as RelativePathString;

const PERSISTED_STORAGE_KEYS = [
  'marka-onboarding',
  'marka-app-lock',
  'marka-theme',
];

export default function SettingsResetScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const router = useRouter();
  const db = useDb();

  const [confirmText, setConfirmText] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = confirmText.trim().toUpperCase() === CONFIRM_TOKEN;

  function handlePressReset() {
    if (!confirmed || running) return;
    Alert.alert(
      'Wipe all data?',
      'This deletes every wallet, bill, payment, expense, and transfer. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe everything',
          style: 'destructive',
          onPress: () => {
            void runReset();
          },
        },
      ],
    );
  }

  async function runReset() {
    setError(null);
    setRunning(true);
    try {
      await clearAllData(db);
      await AsyncStorage.multiRemove(PERSISTED_STORAGE_KEYS);
      // Reset in-memory store state. AsyncStorage.multiRemove only affects
      // the *next* rehydrate; the live Zustand stores need explicit flips
      // so the app/index gate re-routes to onboarding immediately.
      setOnboardingCompleted(false);
      setAppLockEnabled(false);
      setAppLockUnlocked(false);
      router.replace(ROOT_PATH);
    } catch (err) {
      setError((err as Error).message);
      setRunning(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <Text
            style={[theme.typography.body.sm, { color: theme.colors.accent }]}
          >
            Back
          </Text>
        </Pressable>
        <Text style={[theme.typography.title.sm, { color: theme.colors.text }]}>
          Reset
        </Text>
        <View style={styles.headerSpacer} />
      </View>

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
              styles.warningCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.danger,
              },
            ]}
          >
            <Text
              style={[
                theme.typography.body.md,
                styles.warningTitle,
                {
                  color: theme.colors.danger,
                  fontWeight: theme.typography.weights.medium,
                },
              ]}
            >
              This wipes all your data.
            </Text>
            <Text
              style={[
                theme.typography.body.sm,
                styles.warningBody,
                { color: theme.colors.text },
              ]}
            >
              Everything below disappears and cannot be recovered:
            </Text>
            <Text
              style={[
                theme.typography.body.sm,
                styles.warningList,
                { color: theme.colors.textMuted },
              ]}
            >
              • Wallets and balances{'\n'}
              • Bills and payment history{'\n'}
              • Spending and transfers{'\n'}
              • App lock and theme preferences
            </Text>
            <Text
              style={[
                theme.typography.body.sm,
                styles.warningBody,
                { color: theme.colors.textMuted },
              ]}
            >
              You&rsquo;ll be sent back to onboarding to start fresh. If
              you want to keep a copy of your current data, cancel and
              export from Settings → Export first.
            </Text>
          </View>

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

          {error ? (
            <View
              style={[
                styles.errorBanner,
                { borderColor: theme.colors.danger },
              ]}
            >
              <Text
                style={[
                  theme.typography.body.sm,
                  { color: theme.colors.danger },
                ]}
              >
                Reset failed: {error}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={handlePressReset}
            disabled={!confirmed || running}
            accessibilityRole="button"
            accessibilityLabel="Wipe all data"
            accessibilityState={{ disabled: !confirmed || running }}
            style={({ pressed }) => [
              styles.resetButton,
              {
                backgroundColor: theme.colors.danger,
                opacity:
                  !confirmed || running
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
              {running ? 'Wiping…' : 'Wipe all data'}
            </Text>
          </Pressable>
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
    headerSpacer: { width: 36 },
    scrollContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xxxl,
    },
    warningCard: {
      borderWidth: 1,
      borderRadius: theme.radii.md,
      padding: theme.spacing.lg,
    },
    warningTitle: {
      marginBottom: theme.spacing.sm,
    },
    warningBody: {
      marginTop: theme.spacing.sm,
    },
    warningList: {
      marginTop: theme.spacing.sm,
    },
    confirmField: {
      marginTop: theme.spacing.xl,
    },
    errorBanner: {
      borderWidth: theme.borderWidth.hairline,
      borderRadius: theme.radii.sm,
      padding: theme.spacing.md,
      marginTop: theme.spacing.lg,
    },
    resetButton: {
      marginTop: theme.spacing.xl,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radii.md,
      alignItems: 'center',
    },
  });
}

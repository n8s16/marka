// App lock settings screen.
//
// Route: `/settings/app-lock`. Reachable from the Settings hub's "App lock"
// row. Lets the user toggle the lock on or off, and surfaces device
// biometric availability so the toggle is greyed out helpfully when the
// hardware isn't there.
//
// Critical UX (docs/PRD.md §"Behavior decisions" — App lock):
// when the user flips the Switch ON, run a biometric prompt FIRST. Commit
// the persisted flag only on success. This prevents the
// "I-turned-it-on-but-can't-get-back-in" trap if biometrics are misconfigured.
// Toggling OFF is unconditional — no prompt needed.
//
// Layout follows `app/settings/theme.tsx`: SafeAreaView root, header with
// Back link + centered title, hairline-bordered card, helper text below.
//
// PIN fallback is intentionally NOT in v1 — see DECISIONS §27.

import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';

import {
  enableAndUnlockAppLock,
  setAppLockEnabled,
  useAppLockEnabled,
} from '@/state/app-lock';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

// Discriminated union for the device biometric status. `unknown` is the
// initial state while the async hardware/enrollment probe runs; we render a
// neutral placeholder so the row doesn't flicker between states.
type BiometricStatus =
  | { kind: 'unknown' }
  | { kind: 'no-hardware' }
  | { kind: 'not-enrolled' }
  | { kind: 'available'; types: LocalAuthentication.AuthenticationType[] };

export default function AppLockScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const router = useRouter();
  const enabled = useAppLockEnabled();

  const [status, setStatus] = useState<BiometricStatus>({ kind: 'unknown' });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authInFlight, setAuthInFlight] = useState<boolean>(false);

  // Probe biometric hardware + enrollment on mount. We deliberately re-probe
  // every time the screen mounts (rather than caching globally) so that if
  // the user enrolls Face ID in iOS Settings and returns, the next visit
  // reflects the new reality without an app restart.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        if (!hasHardware) {
          if (!cancelled) setStatus({ kind: 'no-hardware' });
          return;
        }
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!isEnrolled) {
          if (!cancelled) setStatus({ kind: 'not-enrolled' });
          return;
        }
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (!cancelled) setStatus({ kind: 'available', types });
      } catch {
        // If probing throws, fall back to "no hardware" — disabling the
        // toggle is the safe default; better than letting the user enable a
        // lock the device can't actually verify.
        if (!cancelled) setStatus({ kind: 'no-hardware' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Switch is disabled while we don't yet know hardware status, when
  // hardware isn't available, or when biometrics aren't enrolled. This is
  // the verify-before-commit flow's first layer — the second layer is the
  // actual auth prompt fired below on flip-ON.
  const switchDisabled =
    status.kind === 'unknown' ||
    status.kind === 'no-hardware' ||
    status.kind === 'not-enrolled' ||
    authInFlight;

  const onToggle = async (next: boolean): Promise<void> => {
    setErrorMessage(null);
    if (!next) {
      // Toggling OFF — no prompt, just commit.
      setAppLockEnabled(false);
      return;
    }
    // Toggling ON — prompt first, commit only on success.
    setAuthInFlight(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify your identity to enable app lock',
        cancelLabel: 'Cancel',
        // We intentionally do NOT set disableDeviceFallback:true. In Expo
        // Go and on certain iOS configurations, that option causes
        // authenticateAsync to silently return success:false without ever
        // showing the prompt — even when biometrics work fine in other
        // apps. The fallback to device passcode is also a natural
        // recovery path that effectively serves as the "PIN fallback"
        // mentioned in the PRD's v1 scope (the phone's own passcode,
        // not a separate app PIN).
      });
      if (result.success) {
        // Flip `enabled` AND `unlocked` atomically. If we only flipped
        // `enabled`, the lock gate's next render would see the user as
        // unverified and immediately auto-prompt a SECOND time on this
        // exact screen — the user just authenticated, that's an
        // infuriating UX bug. enableAndUnlockAppLock keeps the just-
        // verified context.
        enableAndUnlockAppLock();
      } else {
        setErrorMessage('Authentication cancelled — app lock not enabled.');
      }
    } catch {
      setErrorMessage('Authentication failed — app lock not enabled.');
    } finally {
      setAuthInFlight(false);
    }
  };

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
            App lock
          </Text>
          {/* Spacer so the title centers visually opposite the Back link. */}
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text
                  style={[
                    theme.typography.body.md,
                    {
                      color: switchDisabled
                        ? theme.colors.textMuted
                        : theme.colors.text,
                    },
                  ]}
                >
                  Require unlock to open the app
                </Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={onToggle}
                disabled={switchDisabled}
                accessibilityLabel="Require unlock to open the app"
              />
            </View>

            <View
              style={[
                styles.row,
                styles.statusRow,
                {
                  borderTopWidth: theme.borderWidth.hairline,
                  borderTopColor: theme.colors.border,
                },
              ]}
            >
              <Text
                style={[
                  theme.typography.body.sm,
                  { color: theme.colors.textMuted },
                ]}
              >
                {describeStatus(status)}
              </Text>
            </View>
          </View>

          {errorMessage ? (
            <Text
              style={[
                theme.typography.body.sm,
                styles.errorText,
                { color: theme.colors.danger },
              ]}
            >
              {errorMessage}
            </Text>
          ) : null}

          <Text
            style={[
              theme.typography.body.sm,
              styles.helperText,
              { color: theme.colors.textMuted },
            ]}
          >
            When app lock is on, you&apos;ll be asked to authenticate every
            time you open the app or return to it from the background.
            There&apos;s no auto-lock-after-idle in v1.
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// Map the probed status to a single line of plain-language copy. Kept as a
// pure helper outside the component so the cases are easy to scan.
function describeStatus(status: BiometricStatus): string {
  switch (status.kind) {
    case 'unknown':
      return 'Checking biometrics…';
    case 'no-hardware':
      return "This device doesn't support biometrics. App lock is unavailable.";
    case 'not-enrolled':
      return 'No biometrics enrolled. Set up Face ID, Touch ID, or fingerprint in your device settings to enable app lock.';
    case 'available': {
      const label = labelForTypes(status.types);
      return label
        ? `Biometrics available — ${label}.`
        : 'Biometrics available.';
    }
  }
}

function labelForTypes(
  types: LocalAuthentication.AuthenticationType[],
): string | null {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return 'Face ID';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'fingerprint';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return 'iris';
  }
  return null;
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
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      gap: theme.spacing.md,
    },
    rowText: {
      flex: 1,
    },
    statusRow: {
      // Status row is read-only; align the muted message left and let it
      // wrap. No trailing chevron or control.
      justifyContent: 'flex-start',
    },
    helperText: {
      marginTop: theme.spacing.md,
      paddingHorizontal: theme.spacing.xs,
    },
    errorText: {
      marginTop: theme.spacing.md,
      paddingHorizontal: theme.spacing.xs,
    },
  });
}

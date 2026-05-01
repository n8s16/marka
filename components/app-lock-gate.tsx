// App lock gate — wraps the navigator and conditionally renders a lock
// screen instead of children when the user must authenticate.
//
// Behavior (docs/PRD.md §"Behavior decisions" — App lock):
//   - When `enabled` is false, the gate is a pass-through: render children.
//   - When `enabled` is true, render children only after a successful
//     biometric authentication. Cold start starts locked. Returning from
//     a real background re-locks.
//
// State model — both flags live in `state/app-lock.ts`:
//   - `enabled` is persisted; survives cold starts.
//   - `unlocked` is transient (NOT persisted); resets to false on cold
//     start so the user re-authenticates. Living in the store rather than
//     in component state lets Settings flip `enabled` AND `unlocked`
//     atomically via `enableAndUnlockAppLock()`, avoiding a render-race
//     where the gate would briefly see the user as locked out of the
//     screen they just authenticated on.
//
// AppState listener:
//   - We listen ONLY for `'background'`, not `'inactive'`. iOS fires
//     `inactive` for system overlays (Control Center pulldown, the
//     biometric prompt itself, incoming call) — treating those as
//     "user backgrounded the app" produces aggressive re-locking that
//     fights the verify-before-commit flow on the Settings toggle.
//     `background` is the real "user left the app" signal.

import { useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus, Pressable, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import {
  setAppLockUnlocked,
  useAppLockEnabled,
  useAppLockUnlocked,
} from '@/state/app-lock';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

interface AppLockGateProps {
  children: React.ReactNode;
}

export function AppLockGate({ children }: AppLockGateProps): React.ReactElement {
  const enabled = useAppLockEnabled();
  const unlocked = useAppLockUnlocked();

  // Background transitions re-lock the app. We listen at the gate level
  // (not per-screen) so every screen gets the behavior for free.
  // 'inactive' is intentionally NOT included — see the file header.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background') {
        setAppLockUnlocked(false);
      }
    });
    return () => sub.remove();
  }, []);

  if (!enabled || unlocked) {
    return <>{children}</>;
  }

  return <LockScreen onUnlock={() => setAppLockUnlocked(true)} />;
}

// ---------- Lock screen ---------------------------------------------------

interface LockScreenProps {
  onUnlock: () => void;
}

function LockScreen({ onUnlock }: LockScreenProps): React.ReactElement {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [authInFlight, setAuthInFlight] = useState<boolean>(false);
  const [showRetryHint, setShowRetryHint] = useState<boolean>(false);

  const tryAuthenticate = async (): Promise<void> => {
    if (authInFlight) return;
    setAuthInFlight(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Marka',
        cancelLabel: 'Cancel',
        // See app/settings/app-lock.tsx for why disableDeviceFallback is
        // omitted. tl;dr: it caused silent success:false returns in Expo
        // Go without ever showing the prompt. Letting the system fall
        // back to the device passcode also gives the user a recovery
        // path if biometrics break temporarily — same intent as the
        // PRD's "biometrics or PIN" scope (the phone's own passcode).
      });
      if (result.success) {
        onUnlock();
      } else {
        setShowRetryHint(true);
      }
    } catch {
      // Library throws are rare but possible (e.g. iOS interruption). Show
      // the retry hint rather than crashing the gate.
      setShowRetryHint(true);
    } finally {
      setAuthInFlight(false);
    }
  };

  // Auto-prompt on mount. The user lands on the lock screen and the system
  // dialog appears immediately — they don't need to tap "Unlock" first.
  useEffect(() => {
    void tryAuthenticate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.center}>
        <Text style={[theme.typography.title.md, styles.brand]}>Marka</Text>
        <Pressable
          onPress={() => {
            setShowRetryHint(false);
            void tryAuthenticate();
          }}
          accessibilityRole="button"
          accessibilityLabel="Unlock"
          style={({ pressed }) => [
            styles.unlockButton,
            pressed && { opacity: theme.opacity.muted },
          ]}
        >
          <Text style={[theme.typography.body.md, styles.unlockLabel]}>
            {showRetryHint ? 'Tap to retry' : 'Tap to unlock'}
          </Text>
        </Pressable>
        {showRetryHint ? (
          <Text style={[theme.typography.body.sm, styles.hint]}>
            Authentication cancelled.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.xl,
    },
    brand: {
      color: theme.colors.text,
      marginBottom: theme.spacing.xl,
    },
    unlockButton: {
      paddingHorizontal: theme.spacing.xl,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radii.md,
      borderColor: theme.colors.border,
      borderWidth: theme.borderWidth.hairline,
      backgroundColor: theme.colors.surface,
    },
    unlockLabel: {
      color: theme.colors.accent,
      fontWeight: theme.typography.weights.medium,
    },
    hint: {
      marginTop: theme.spacing.md,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
  });
}

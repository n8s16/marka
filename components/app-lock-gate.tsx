// App lock gate — wraps the navigator and conditionally renders a lock
// screen instead of children when the user must authenticate.
//
// Behavior (docs/PRD.md §"Behavior decisions" — App lock):
//   - When `enabled` is false, the gate is a pass-through: render children.
//   - When `enabled` is true, render children only after a successful
//     biometric authentication. Cold start starts locked. Returning from
//     background re-locks.
//
// State model:
//   - `enabled` lives in the persisted store (`state/app-lock.ts`).
//   - `unlocked` is local to this component and explicitly NOT persisted —
//     it must reset on every cold start so the user re-authenticates.
//
// Background-transition handling:
//   - Subscribe to `AppState`. When the app moves to `background` or
//     `inactive`, set `unlocked = false`. The next `active` will surface the
//     lock screen, which auto-prompts on mount.
//
// "Just enabled" UX subtlety:
//   - The Settings screen calls `setAppLockEnabled(true)` only after a
//     biometric verification. The user is already in a verified context, so
//     we don't want to immediately lock them out. We watch `enabled` for a
//     false→true transition and set `unlocked = true` in the same tick.
//     The next background→foreground will re-lock, as expected.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Pressable, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import { useAppLockEnabled } from '@/state/app-lock';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

interface AppLockGateProps {
  children: React.ReactNode;
}

export function AppLockGate({ children }: AppLockGateProps): React.ReactElement {
  const enabled = useAppLockEnabled();
  const [unlocked, setUnlocked] = useState<boolean>(false);

  // Track the previous `enabled` value to detect false→true transitions
  // ("just enabled from Settings"). On that transition, the user is already
  // in a verified context — leave them unlocked until the next background.
  const prevEnabledRef = useRef<boolean>(enabled);
  useEffect(() => {
    const prev = prevEnabledRef.current;
    if (!prev && enabled) {
      setUnlocked(true);
    }
    prevEnabledRef.current = enabled;
  }, [enabled]);

  // Background transitions re-lock the app. We listen at the gate level
  // (not per-screen) so every screen gets the behavior for free.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        setUnlocked(false);
      }
    });
    return () => sub.remove();
  }, []);

  if (!enabled || unlocked) {
    return <>{children}</>;
  }

  return <LockScreen onUnlock={() => setUnlocked(true)} />;
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
        // disableDeviceFallback keeps the prompt biometric-only on iOS,
        // matching the v1 decision (DECISIONS §27 — biometrics only).
        disableDeviceFallback: true,
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

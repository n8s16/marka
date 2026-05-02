// Onboarding step 2 — add first bill (skippable).
//
// Per docs/PRD.md §"Onboarding (first run only)":
//   "Add first bill — bill form with placeholder examples. Skippable.
//    Lands on Bills — first bill highlighted with a tooltip pointing at
//    it: 'Tap when paid.'"
//
// We don't embed a bespoke form here — instead, the screen is a short
// explainer with two paths:
//   - "Add my first bill" → routes to /bills/new?onboarding=1. The bill
//     form already has every field we need (frequency, due-date, default
//     wallet, reminders, auto-forecast). The query param tells the form
//     to flip the onboarding-complete flag and route to /(tabs)/bills on
//     save instead of router.back()'ing into us.
//   - "Skip for now" → flips the flag and routes straight to /(tabs)/bills.
//
// The PRD's "first bill highlighted with a tooltip" is intentionally NOT
// implemented in v1 — tooltip positioning math costs more than it
// returns when the action ("tap a row when paid") is already discoverable
// via the strikethrough idiom on subsequent paid rows.

import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type RelativePathString } from 'expo-router';

import { setOnboardingCompleted } from '@/state/onboarding';
import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

// Cast: the typed-routes manifest doesn't yet know about the bills tab
// when type-checking a sibling group route. Same pattern as `app/index.tsx`.
const BILLS_TAB_PATH = '/(tabs)/bills' as RelativePathString;
const BILL_NEW_ONBOARDING = '/bills/new?onboarding=1' as RelativePathString;

export default function OnboardingAddFirstBillScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const router = useRouter();

  function handleAdd() {
    router.push(BILL_NEW_ONBOARDING);
  }

  function handleSkip() {
    setOnboardingCompleted(true);
    router.replace(BILLS_TAB_PATH);
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[theme.typography.title.md, { color: theme.colors.text }]}>
          Add your first bill
        </Text>
        <Text
          style={[
            theme.typography.body.sm,
            styles.subhead,
            { color: theme.colors.textMuted },
          ]}
        >
          Recurring stuff like rent, electricity, internet, subscriptions.
          Marka tracks each bill&rsquo;s due dates and reminds you before
          they&rsquo;re due.
        </Text>

        <View
          style={[
            styles.exampleCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text
            style={[
              theme.typography.label.sm,
              styles.exampleHeading,
              { color: theme.colors.textFaint },
            ]}
          >
            EXAMPLES
          </Text>
          <Text
            style={[
              theme.typography.body.sm,
              { color: theme.colors.textMuted },
            ]}
          >
            • Meralco — monthly, ₱2,500{'\n'}
            • Globe fiber — monthly, ₱1,599{'\n'}
            • Spotify — monthly, ₱149{'\n'}
            • Comprehensive insurance — yearly, ₱18,000
          </Text>
        </View>

        <Text
          style={[
            theme.typography.body.sm,
            styles.helper,
            { color: theme.colors.textMuted },
          ]}
        >
          You can add more bills any time from the Bills tab.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <Pressable
          onPress={handleAdd}
          accessibilityRole="button"
          accessibilityLabel="Add my first bill"
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: theme.colors.accent,
              opacity: pressed ? theme.opacity.muted : 1,
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
            Add my first bill
          </Text>
        </Pressable>

        <Pressable
          onPress={handleSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip for now"
          hitSlop={8}
          style={styles.skipButton}
        >
          <Text
            style={[
              theme.typography.body.sm,
              { color: theme.colors.textMuted },
            ]}
          >
            Skip for now
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.bg },
    scrollContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.xl,
      paddingBottom: theme.spacing.xl,
    },
    subhead: {
      marginTop: theme.spacing.sm,
      marginBottom: theme.spacing.xl,
    },
    exampleCard: {
      borderWidth: 1,
      borderRadius: theme.radii.md,
      padding: theme.spacing.lg,
    },
    exampleHeading: {
      marginBottom: theme.spacing.sm,
      letterSpacing: 1,
    },
    helper: {
      marginTop: theme.spacing.lg,
      textAlign: 'center',
    },
    footer: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.lg,
      borderTopWidth: theme.borderWidth.hairline,
      gap: theme.spacing.sm,
    },
    primaryButton: {
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radii.md,
      alignItems: 'center',
    },
    skipButton: {
      paddingVertical: theme.spacing.md,
      alignItems: 'center',
    },
  });
}

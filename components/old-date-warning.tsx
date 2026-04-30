// Soft "this date is more than 30 days ago" warning.
//
// PRD §"Behavior decisions": "logging a transaction with a date more than 30
// days in the past shows a small 'logging an older transaction — is this date
// correct?' notice that dismisses with one tap. Never blocking."
//
// This component is the shared visual; the helper `isOldDate(date, today)`
// is exported for forms that need to compute the flag separately (e.g. to
// gate a side-effect rather than render the warning).

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { differenceInCalendarDays, parseISO } from 'date-fns';

import { useTheme } from '@/state/theme';
import type { Theme } from '@/styles/theme';

const STALE_THRESHOLD_DAYS = 30;

/**
 * Returns true when `date` (YYYY-MM-DD) is more than 30 calendar days
 * before `today`. Returns false on malformed input — the warning is only
 * meant to fire for valid past dates.
 */
export function isOldDate(date: string, today: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = parseISO(date);
  if (Number.isNaN(parsed.getTime())) return false;
  return differenceInCalendarDays(today, parsed) > STALE_THRESHOLD_DAYS;
}

export interface OldDateWarningProps {
  /** Caller controls dismissal — we render until told to hide. */
  onDismiss: () => void;
  /** Optional override copy if the caller wants to customise wording. */
  message?: string;
}

export function OldDateWarning({ onDismiss, message }: OldDateWarningProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={[styles.box, { borderColor: theme.colors.warning }]}>
      <Text style={[theme.typography.body.sm, { color: theme.colors.text, flex: 1 }]}>
        {message ?? 'Logging an older transaction — is this date correct?'}
      </Text>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss old date warning"
        hitSlop={8}
        style={styles.dismiss}
      >
        <Text
          style={[
            theme.typography.body.md,
            { color: theme.colors.textMuted, fontWeight: theme.typography.weights.medium },
          ]}
        >
          ×
        </Text>
      </Pressable>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    box: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: theme.borderWidth.hairline,
      borderRadius: theme.radii.sm,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      gap: theme.spacing.sm,
      marginVertical: theme.spacing.xs,
    },
    dismiss: {
      paddingHorizontal: theme.spacing.xs,
    },
  });
}

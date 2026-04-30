// Inline reminder callout shown above the Bills list when at least one bill
// has an active reminder for its current period.
//
// Per docs/PRD.md the callout is dismissable in one tap and never blocking;
// dismissal is deferred to a later step (state plumbing for "soft warnings"
// will land alongside the 30-day-old date warning). For now it's purely
// informational — the parent screen decides whether to render it at all.

import { Text, View } from 'react-native';

import { formatCurrency } from '@/logic/currency';
import type { Bill } from '@/db/queries/bills';
import { useTheme } from '@/state/theme';

export interface BillsReminderCalloutProps {
  bill: Bill;
  daysUntilDue: number;
  amount: number; // centavos
  walletName?: string;
}

export function BillsReminderCallout({
  bill,
  daysUntilDue,
  amount,
  walletName,
}: BillsReminderCalloutProps) {
  const theme = useTheme();

  const dayLabel =
    daysUntilDue === 0
      ? 'today'
      : `in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`;

  return (
    <View
      style={{
        backgroundColor: theme.colors.surfaceMuted,
        borderColor: theme.colors.border,
        borderWidth: theme.borderWidth.hairline,
        borderRadius: theme.radii.md,
        padding: theme.spacing.md,
        marginHorizontal: theme.spacing.lg,
        marginBottom: theme.spacing.md,
      }}
    >
      <Text style={[theme.typography.body.sm, { color: theme.colors.text }]}>
        Reminder: {bill.name} due {dayLabel} ({formatCurrency(amount)}
        {walletName ? `, ${walletName}` : ''})
      </Text>
    </View>
  );
}

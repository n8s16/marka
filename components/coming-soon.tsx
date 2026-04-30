// Coming-soon placeholder for tabs whose screens land in later build steps.
//
// Kept tiny on purpose — `ui-designer` will replace these with proper empty
// states / call-to-action screens as each tab gets wired up. Until then this
// gives the user a non-blank page so they can verify navigation works in
// Expo Go.

import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/state/theme';

export interface ComingSoonProps {
  title: string;
}

export function ComingSoon({ title }: ComingSoonProps) {
  const theme = useTheme();

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: theme.colors.bg }]}
    >
      <View style={styles.center}>
        <Text
          style={[
            theme.typography.title.md,
            { color: theme.colors.text, marginBottom: theme.spacing.sm },
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            theme.typography.body.sm,
            { color: theme.colors.textMuted },
          ]}
        >
          Coming soon
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

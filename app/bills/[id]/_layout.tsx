// Layout for bill detail routes (`/bills/<id>`).
//
// Three routes live under here:
//   - `index.tsx` — the Add/Edit bill form. Default presentation (push).
//   - `mark-paid.tsx` — the Mark-as-paid sheet, opened by tapping an
//     unpaid bill row. Modal presentation.
//   - `payment-details.tsx` — the Payment details sheet, opened by
//     tapping a *paid* bill row (decision 24). Modal presentation.
//
// Modal presentation must be declared at the layout level (here), not on
// the screen itself. Declaring it inside the screen file works in some
// Expo Router builds but is fragile: the screen has to mount before it
// can register itself as a modal, which can present as a flicker, a
// double-mount, or — in the worst case we hit during testing — an
// apparent "redirect loop" where the modal half-opens and the navigator
// re-resolves to the parent route.

import { Stack } from 'expo-router';

export default function BillIdLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="mark-paid" options={{ presentation: 'modal' }} />
      <Stack.Screen
        name="payment-details"
        options={{ presentation: 'modal' }}
      />
    </Stack>
  );
}

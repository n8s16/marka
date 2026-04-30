// Root route → redirect into the tabs group on Bills.
//
// Keeping this as a small Redirect component (rather than removing it) means
// any deep link that lands on `/` lands in a known good place. Onboarding
// (build step 5) will gate this with a "first run" check.

import { Redirect, type RelativePathString } from 'expo-router';

// Cast: the typed-routes manifest in `.expo/types/router.d.ts` is regenerated
// by Metro on `expo start`, so at this point in the build it doesn't yet know
// about `/bills`. The cast is safe — Expo Router's group routes (`(tabs)`)
// are invisible in the URL, and `/bills` resolves to `app/(tabs)/bills.tsx`.
const BILLS_PATH = '/bills' as RelativePathString;

export default function Index() {
  return <Redirect href={BILLS_PATH} />;
}

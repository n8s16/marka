// Onboarding stack — sits as a sibling to (tabs).
//
// The two onboarding screens are intentionally header-less so each can render
// its own title + action layout. We disable the back-swipe gesture on iOS so
// the user can't half-dismiss the flow into nothing — they finish via
// "Continue" / "Skip" or the explicit back behaviour we wire up.

import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
      }}
    />
  );
}

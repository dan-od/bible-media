import { Stack } from 'expo-router';

/** Onboarding is its own stack; each step pushes the next. */
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}

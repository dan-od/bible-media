import { Stack } from 'expo-router';

/** Signing in is its own stack: email, code, (first time) about you, then the copy step. */
export default function AccountLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}

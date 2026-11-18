import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CollectionProvider } from '@/hooks/use-collection';
import { ProfileProvider, useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

// Hold the splash until the profile has loaded so we never flash the wrong
// screen before deciding onboarding vs. feed.
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { ready, profile } = useProfile();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const inOnboarding = segments[0] === 'onboarding';
    if (!profile.onboarded && !inOnboarding) {
      router.replace('/onboarding');
    } else if (profile.onboarded && inOnboarding) {
      router.replace('/');
    }
    SplashScreen.hideAsync();
  }, [ready, profile.onboarded, segments, router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
    </Stack>
  );
}

export default function RootLayout() {
  const { scheme } = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <ProfileProvider>
          <CollectionProvider>
            <RootNavigator />
          </CollectionProvider>
        </ProfileProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

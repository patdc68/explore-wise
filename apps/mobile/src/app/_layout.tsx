import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider } from '@/providers/auth-provider';
import { FavoritesProvider } from '@/providers/favorites-provider';
import { CurrentLocationProvider } from '@/providers/current-location-provider';
import { PlanningHandoffProvider } from '@/providers/planning-handoff-provider';
import { PlanningAlternativesProvider } from '@/providers/planning-alternatives-provider';

SplashScreen.preventAutoHideAsync();
WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <FavoritesProvider>
          <PlanningHandoffProvider>
            <PlanningAlternativesProvider>
              <CurrentLocationProvider>
            <AnimatedSplashOverlay />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="place/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="place/[id]/report" options={{ headerShown: false }} />
              <Stack.Screen name="plan/alternatives" options={{ headerShown: false }} />
              <Stack.Screen name="auth/sign-in" options={{ headerShown: false }} />
              <Stack.Screen name="auth/sign-up" options={{ headerShown: false }} />
            </Stack>
              </CurrentLocationProvider>
            </PlanningAlternativesProvider>
          </PlanningHandoffProvider>
        </FavoritesProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

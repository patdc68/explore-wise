import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Appearance, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useFonts } from 'expo-font';
import { SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useDesignTheme } from '@/hooks/use-theme';
import { ThemeProvider, useThemePreference } from '@/providers/theme-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { FavoritesProvider } from '@/providers/favorites-provider';
import { CurrentLocationProvider } from '@/providers/current-location-provider';
import { PlanningHandoffProvider } from '@/providers/planning-handoff-provider';
import { PlanningAlternativesProvider } from '@/providers/planning-alternatives-provider';
import { ItineraryExecutionProvider } from '@/providers/itinerary-execution-provider';

SplashScreen.preventAutoHideAsync();
WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold, PlusJakartaSans_400Regular });
  // Keep the native splash until bundled fonts resolve; an asset error still opens the app.
  if (!fontsLoaded && !fontError) return null;
  return <ThemeProvider><ThemedRootLayout /></ThemeProvider>;
}

function ThemedRootLayout() {
  const { preference } = useThemePreference();
  const theme = useDesignTheme();
  const navigationBase = preference === 'dark' ? DarkTheme : DefaultTheme;

  useEffect(() => {
    if (Platform.OS === 'web') {
      document.documentElement.style.colorScheme = preference;
    } else {
      Appearance.setColorScheme(preference);
    }
    void SystemUI.setBackgroundColorAsync(theme.background.canvas).catch(() => {});
  }, [preference, theme.background.canvas]);

  return (
    <NavigationThemeProvider value={{
      ...navigationBase,
      colors: {
        ...navigationBase.colors,
        primary: theme.accent.primary,
        background: theme.background.canvas,
        card: theme.background.surfaceRaised,
        text: theme.text.primary,
        border: theme.border.default,
        notification: theme.semantic.error.default,
      },
    }}>
      <StatusBar style={preference === 'dark' ? 'light' : 'dark'} />
      <AuthProvider>
        <FavoritesProvider>
          <PlanningHandoffProvider>
            <ItineraryExecutionProvider>
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
              <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
            </Stack>
              </CurrentLocationProvider>
            </PlanningAlternativesProvider>
            </ItineraryExecutionProvider>
          </PlanningHandoffProvider>
        </FavoritesProvider>
      </AuthProvider>
    </NavigationThemeProvider>
  );
}

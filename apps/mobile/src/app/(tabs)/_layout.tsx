import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme, useThemeElevation } from '@/hooks/use-theme';

export default function DiscoveryTabsLayout() {
  const colors = useTheme();
  const elevation = useThemeElevation();
  const insets = useSafeAreaInsets();
  const icon = (name: React.ComponentProps<typeof Ionicons>['name'], color: ColorValue, focused: boolean) => (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 40, height: 28, borderRadius: Radius.pill, backgroundColor: focused ? colors.accent : 'transparent' }}>
      <Ionicons color={focused ? colors.accentText : color} name={name} size={21} />
    </View>
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        tabBarHideOnKeyboard: true,
        tabBarItemStyle: {
          borderRadius: Radius.button,
          marginHorizontal: Spacing.xs,
          marginVertical: 6,
        },
        tabBarStyle: {
          position: 'absolute',
          left: Spacing.md,
          right: Spacing.md,
          bottom: insets.bottom + Spacing.md,
          borderRadius: Radius.navigation,
          backgroundColor: colors.elevatedSurface,
          borderColor: colors.border,
          borderWidth: 1,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 0,
          paddingHorizontal: Spacing.xs,
          paddingTop: 4,
          ...elevation.raised,
          shadowColor: colors.shadow,
        },
        tabBarLabelStyle: { ...Typography.badge, fontSize: 10, lineHeight: 14 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, focused }) => icon('compass-outline', color, focused),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plan',
          tabBarIcon: ({ color, focused }) => icon('map-outline', color, focused),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: 'Favorites',
          tabBarIcon: ({ color, focused }) => icon('heart-outline', color, focused),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => icon('person-outline', color, focused),
        }}
      />
    </Tabs>
  );
}

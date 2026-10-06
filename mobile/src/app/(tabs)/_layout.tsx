import React from 'react';
import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../theme';

type Icon = React.ComponentProps<typeof MaterialIcons>['name'];
const tab = (title: string, icon: Icon) => ({
  title,
  tabBarIcon: ({ color }: { color: ColorValue }) => <MaterialIcons name={icon} size={24} color={color} />,
});

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.grey,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.canvas, borderTopWidth: 0, elevation: 0, height: 56 + insets.bottom },
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Tabs.Screen name="index" options={tab('Today', 'receipt-long')} />
      <Tabs.Screen name="upcoming" options={tab('Upcoming', 'event')} />
      <Tabs.Screen name="settings" options={tab('Settings', 'settings')} />
    </Tabs>
  );
}

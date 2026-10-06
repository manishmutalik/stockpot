import React from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../theme';

export default function Upcoming() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top + 12, paddingHorizontal: 16, gap: 8 }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 22, color: colors.ink }}>Upcoming</Text>
      <Text style={{ fontFamily: fonts.regular, fontSize: 15, color: colors.grey }}>Your pre-orders will be listed here in the next update.</Text>
    </View>
  );
}

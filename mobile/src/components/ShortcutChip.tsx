import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { cardShadow, colors, fonts, radius } from '../theme';

export function ShortcutChip({ icon, label, onPress }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: colors.card, borderRadius: radius.full, borderWidth: 1, borderColor: `${colors.outline}4D`, transform: [{ scale: pressed ? 0.98 : 1 }] },
        cardShadow,
      ]}
    >
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${colors.primary}1A`, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialIcons name={icon} size={20} color={colors.primary} />
      </View>
      <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink, flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );
}

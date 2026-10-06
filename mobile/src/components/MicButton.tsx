import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, fonts } from '../theme';

/** The big "Tell Stockpot what happened" button, with its halo, caption and an example. */
export function MicButton({ onPress }: { onPress: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 24 }}>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', width: 128, height: 128, borderRadius: 64, backgroundColor: `${colors.primary}1A` }} />
        <View style={{ position: 'absolute', width: 112, height: 112, borderRadius: 56, backgroundColor: `${colors.primary}26` }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voice input: Tell Stockpot what happened"
          onPress={onPress}
          style={({ pressed }) => ({
            width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center',
            backgroundColor: pressed ? colors.primaryPressed : colors.primary,
            shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}
        >
          <MaterialIcons name="mic" size={42} color={colors.white} />
        </Pressable>
      </View>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink, marginTop: 16 }}>Tell Stockpot what happened</Text>
      <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey, marginTop: 4, maxWidth: 280, textAlign: 'center', lineHeight: 19 }}>
        e.g. Priya paid the remaining thirteen hundred by UPI
      </Text>
    </View>
  );
}

import React from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { colors, fonts, radius } from '../theme';

export function Button({ label, onPress, busy, disabled, variant = 'primary', icon }: {
  label: string; onPress: () => void; busy?: boolean; disabled?: boolean; variant?: 'primary' | 'quiet' | 'soft'; icon?: React.ReactNode;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52, borderRadius: radius.md, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: primary ? (pressed ? colors.primaryPressed : colors.primary) : variant === 'soft' ? colors.inputFill : colors.card,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      {busy ? <ActivityIndicator color={primary ? colors.white : colors.primary} /> : (
        <>
          {icon}
          <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: primary ? colors.white : colors.primary }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

import React from 'react';
import { View, type ViewProps } from 'react-native';
import { cardShadow, colors, radius } from '../theme';

export function Card({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[{ backgroundColor: colors.card, borderRadius: radius.lg, padding: 16 }, cardShadow, style]} />;
}

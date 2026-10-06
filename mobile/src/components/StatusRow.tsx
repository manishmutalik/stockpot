import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { StatusLine } from '../../../src/utils/quickApiTypes';
import { cardShadow, colors, fonts, radius, toneColor } from '../theme';

/** One thing that needs attention: a coloured dot and the line, with a chevron when it opens somewhere. */
export function StatusRow({ line, onPress }: { line: StatusLine; onPress?: () => void }) {
  const tone = toneColor[line.tone];
  const content = (
    <View style={[{ backgroundColor: colors.card, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: `${tone}26` }, cardShadow]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
        <View style={{ width: 10, height: 10, borderRadius: radius.full, backgroundColor: tone }} />
        <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, flexShrink: 1 }}>{line.label}</Text>
      </View>
      {onPress && <MaterialIcons name="chevron-right" size={20} color={colors.grey} />}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>{content}</Pressable> : content;
}

/** Shown when nothing needs doing. */
export function AllClear() {
  return (
    <View style={[{ backgroundColor: colors.card, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: `${colors.green}33` }, cardShadow]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
        <View style={{ width: 10, height: 10, borderRadius: radius.full, backgroundColor: colors.green }} />
        <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, flexShrink: 1 }}>All clear — nothing needs you right now</Text>
      </View>
      <MaterialIcons name="check-circle" size={20} color={colors.green} />
    </View>
  );
}

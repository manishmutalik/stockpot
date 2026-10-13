import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fmtAmount, readNumber } from '../../lib/recipeReader';
import { noOutline } from '../../lib/webInput';
import { colors, fonts, radius } from '../../theme';

/**
 * The small pieces the recipe check screen is built from: a number box, a row of choices, and a sheet to choose one of
 * many (a material, or the item a recipe is part of) with a search box.
 */

/** A number box: keeps what is typed ("1." while typing 1.5) and passes up the number, or null while it is not one. */
export function NumberField({ label, value, onChange, suffix, placeholder, flagged, integer }: {
  label: string; value: number | null; onChange: (n: number | null) => void; suffix?: string; placeholder?: string; flagged?: boolean; integer?: boolean;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const change = (t: string) => {
    setText(t);
    const n = readNumber(t);
    onChange(n !== null && integer && !Number.isInteger(n) ? null : n);
  };
  return (
    <View style={{ gap: 4, flex: 1, minWidth: 120 }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.grey }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, borderRadius: radius.md, paddingHorizontal: 12, backgroundColor: colors.inputFill, borderWidth: flagged ? 2 : 0, borderColor: colors.amber }}>
        <TextInput
          value={text} onChangeText={change} keyboardType={integer ? 'number-pad' : 'decimal-pad'} placeholder={placeholder} placeholderTextColor={colors.grey}
          accessibilityLabel={label} style={[{ flex: 1, minWidth: 0, fontFamily: fonts.mono, fontSize: 16, color: colors.ink, paddingVertical: 10 }, noOutline]}
        />
        {suffix ? <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.grey }}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

/** A row of choices, one of them on. */
export function Choices<T extends string>({ label, options, value, onChange }: {
  label?: string; options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(o.value)}
            style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: radius.full, justifyContent: 'center', borderWidth: 1, borderColor: on ? colors.primary : colors.outline, backgroundColor: on ? `${colors.primary}14` : colors.white }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: on ? colors.primary : colors.ink }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A tappable box showing what is chosen, which opens a ChoiceSheet. */
export function PickerButton({ label, text, onPress, flagged, muted }: { label: string; text: string; onPress: () => void; flagged?: boolean; muted?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${text}`} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: pressed ? `${colors.primary}14` : colors.inputFill, borderWidth: flagged ? 2 : 0, borderColor: colors.amber })}>
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: muted ? colors.grey : colors.ink }}>{text}</Text>
      <MaterialIcons name="expand-more" size={20} color={colors.grey} />
    </Pressable>
  );
}

export interface SheetOption { value: string; label: string; hint?: string; icon?: React.ComponentProps<typeof MaterialIcons>['name'] }

/**
 * A full-height sheet listing options, with a search box when there are many. `pinned` options (a new material, leave
 * out) stay at the top whatever is searched.
 */
export function ChoiceSheet({ visible, title, options, pinned = [], selected, onChoose, onClose }: {
  visible: boolean; title: string; options: SheetOption[]; pinned?: SheetOption[]; selected?: string; onChoose: (value: string) => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...pinned, ...(q ? options.filter(o => o.label.toLowerCase().includes(q)) : options)];
  }, [query, options, pinned]);
  const close = () => { setQuery(''); onClose(); };
  const choose = (v: string) => { setQuery(''); onChoose(v); };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top + 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={8} style={{ padding: 10 }}>
            <MaterialIcons name="close" size={24} color={colors.ink} />
          </Pressable>
          <Text accessibilityRole="header" numberOfLines={2} style={{ flex: 1, fontFamily: fonts.bold, fontSize: 18, color: colors.ink }}>{title}</Text>
        </View>
        {options.length > 8 && (
          <View style={{ marginHorizontal: 16, marginVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, backgroundColor: colors.card, paddingHorizontal: 12 }}>
            <MaterialIcons name="search" size={20} color={colors.grey} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.grey} accessibilityLabel="Search"
              style={[{ flex: 1, minHeight: 48, fontFamily: fonts.regular, fontSize: 16, color: colors.ink }, noOutline]} />
          </View>
        )}
        <FlatList
          data={shown} keyExtractor={o => o.value} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: `${colors.outline}66` }} />}
          ListEmptyComponent={<Text style={{ fontFamily: fonts.regular, fontSize: 15, color: colors.grey, padding: 16 }}>Nothing matches.</Text>}
          renderItem={({ item }) => {
            const on = item.value === selected;
            return (
              <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => choose(item.value)}
                style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, backgroundColor: pressed ? `${colors.primary}0D` : 'transparent' })}>
                {item.icon && <MaterialIcons name={item.icon} size={20} color={colors.primary} />}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: on ? fonts.bold : fonts.semibold, fontSize: 16, color: on ? colors.primary : colors.ink }}>{item.label}</Text>
                  {item.hint ? <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey }}>{item.hint}</Text> : null}
                </View>
                {on && <MaterialIcons name="check" size={20} color={colors.primary} />}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

/** "₹12.50" with the currency symbol. */
export const money = (symbol: string, n: number) => `${symbol}${fmtAmount(n)}`;

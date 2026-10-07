import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Question, QuickKind } from '../../../src/utils/quickApiTypes';
import { Button } from './Button';
import { Card } from './Card';
import { noOutline } from '../lib/webInput';
import { colors, fonts, radius } from '../theme';

const AMOUNT = /^\d+(\.\d{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar days from today, as YYYY-MM-DD in the phone's own local date (a calendar, not money: nothing the server must decide). */
function localDays(from: number, to: number): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const step = from <= to ? 1 : -1;
  for (let d = from; step > 0 ? d <= to : d >= to; d += step) {
    const date = new Date(); date.setDate(date.getDate() + d);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    out.push({ value, label: d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d === -1 ? 'Yesterday' : date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) });
  }
  return out;
}

/**
 * One question: tappable choices, day chips for a date, or a number for an amount (with the amounts that would work as
 * chips). Nothing is sent until Continue.
 */
export function QuestionCard({ question, kind, number, of, busy, onAnswer }: {
  question: Question; kind: QuickKind | null; number: number; of: number; busy: boolean; onAnswer: (value: string) => void;
}) {
  const [picked, setPicked] = useState<string>('');
  const [typed, setTyped] = useState('');
  const days = useMemo(() => (kind === 'production' ? localDays(0, -6) : localDays(0, 7)), [kind]);
  const value = question.type === 'choice' ? picked : question.type === 'date' ? (picked || typed.trim()) : (typed.trim() || picked);
  const valid = question.type === 'choice' ? !!picked : question.type === 'date' ? DATE.test(value) : AMOUNT.test(value);

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ backgroundColor: `${colors.primary}1F`, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ fontFamily: fonts.mono, fontSize: 12, letterSpacing: 1, color: colors.primary }}>QUESTION {number} OF {of}</Text>
        </View>
        <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.inputFill }}>
          <View style={{ width: `${Math.min(100, (number / of) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
        </View>
      </View>

      <Card style={{ gap: 12 }}>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.ink, lineHeight: 26 }}>{question.prompt}</Text>

        {question.type === 'choice' && question.options?.map(o => {
          const on = picked === o.value;
          return (
            <Pressable
              key={o.value} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setPicked(o.value)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16, borderRadius: radius.md, backgroundColor: on ? colors.inputFill : colors.card, borderWidth: 1, borderColor: on ? colors.primary : `${colors.outline}80` }}
            >
              <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink, flexShrink: 1 }}>{o.label}</Text>
              {on && <MaterialIcons name="check-circle" size={24} color={colors.primary} />}
            </Pressable>
          );
        })}

        {question.type === 'date' && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {days.map(d => {
                const on = picked === d.value;
                return (
                  <Pressable key={d.value} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { setPicked(d.value); setTyped(''); }}
                    style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.full, backgroundColor: on ? colors.primary : colors.inputFill }}>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: on ? colors.white : colors.ink }}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <TextInput
              value={typed} onChangeText={t => { setTyped(t); setPicked(''); }} placeholder="or type a date: 2026-10-24" placeholderTextColor={colors.grey}
              autoCapitalize="none" keyboardType="numbers-and-punctuation"
              style={[{ fontFamily: fonts.regular, fontSize: 16, color: colors.ink, backgroundColor: colors.inputFill, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 12 }, noOutline]}
            />
          </>
        )}

        {question.type === 'amount' && (
          <>
            {question.options?.map(o => {
              const on = !typed && picked === o.value;
              return (
                <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { setPicked(o.value); setTyped(''); }}
                  style={{ padding: 14, borderRadius: radius.md, backgroundColor: on ? colors.inputFill : colors.card, borderWidth: 1, borderColor: on ? colors.primary : `${colors.outline}80` }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{o.label}</Text>
                </Pressable>
              );
            })}
            <TextInput
              value={typed} onChangeText={t => { setTyped(t); setPicked(''); }} placeholder="Amount" placeholderTextColor={colors.grey} keyboardType="decimal-pad"
              accessibilityLabel="Amount"
              style={[{ fontFamily: fonts.mono, fontSize: 20, color: colors.ink, backgroundColor: colors.inputFill, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 12 }, noOutline]}
            />
          </>
        )}
      </Card>

      <Button label="Continue" onPress={() => onAnswer(value)} disabled={!valid} busy={busy} icon={<MaterialIcons name="arrow-forward" size={22} color={colors.white} />} />
    </View>
  );
}

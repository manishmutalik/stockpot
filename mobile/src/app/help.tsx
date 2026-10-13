import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HELP_TOPICS, helpSectionsFor, helpSpans, searchAllHelp, type HelpBlock, type HelpTopic } from '../../../src/utils/helpTopics';
import { Card } from '../components/Card';
import { noOutline } from '../lib/webInput';
import { colors, fonts, radius } from '../theme';

/**
 * Help: the same topics as the website's Help tab (src/utils/helpTopics), the phone's first and then what is done on the
 * website, with a search box. A topic opens in place; the back button (or Android's) returns to the list.
 */
const PHONE_SECTIONS = helpSectionsFor('phone');
const WEB_ONLY = HELP_TOPICS.filter(t => t.apps.includes('web') && !t.apps.includes('phone'));

function Rich({ text, style }: { text: string; style: object }) {
  return (
    <Text style={style}>
      {helpSpans(text).map((s, i) => (s.bold ? <Text key={i} style={{ fontFamily: fonts.bold, color: colors.ink }}>{s.text}</Text> : s.text))}
    </Text>
  );
}

const BODY = { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, color: colors.ink };

function Block({ block }: { block: HelpBlock }) {
  if (block.kind === 'text') return <Rich text={block.text} style={BODY} />;
  return (
    <View style={{ gap: 10 }}>
      {block.items.map((item, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
          {block.kind === 'steps' ? (
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: `${colors.primary}1A`, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.primary }}>{i + 1}</Text>
            </View>
          ) : (
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 9, marginHorizontal: 9 }} />
          )}
          <View style={{ flex: 1 }}><Rich text={item} style={BODY} /></View>
        </View>
      ))}
    </View>
  );
}

function TopicRow({ topic, onOpen, last }: { topic: HelpTopic; onOpen: (id: string) => void; last: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={() => onOpen(topic.id)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderColor: `${colors.outline}55`, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{topic.title}</Text>
        <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey }}>{topic.summary}</Text>
      </View>
      {!topic.apps.includes('phone') && <MaterialIcons name="computer" size={16} color={colors.grey} accessibilityLabel="On the website" />}
      <MaterialIcons name="chevron-right" size={22} color={colors.grey} />
    </Pressable>
  );
}

function Section({ title, topics, onOpen }: { title: string; topics: HelpTopic[]; onOpen: (id: string) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.grey, paddingHorizontal: 4 }}>{title.toUpperCase()}</Text>
      <Card style={{ paddingVertical: 4 }}>
        {topics.map((t, i) => <TopicRow key={t.id} topic={t} onOpen={onOpen} last={i === topics.length - 1} />)}
      </Card>
    </View>
  );
}

export default function Help() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const open = openId ? HELP_TOPICS.find(t => t.id === openId) ?? null : null;
  const results = useMemo(() => (query.trim() ? searchAllHelp(query, 'phone') : null), [query]);

  const openTopic = (id: string) => { setOpenId(id); scroll.current?.scrollTo({ y: 0, animated: false }); };
  const back = () => (open ? setOpenId(null) : router.back());
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpenId(null); return true; });
    return () => sub.remove();
  }, [open]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 8, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Back to all help' : 'Close'} onPress={back} hitSlop={8} style={{ padding: 10 }}>
          <MaterialIcons name={open ? 'arrow-back' : 'close'} size={24} color={colors.ink} />
        </Pressable>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.ink }}>Help</Text>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 20 }} keyboardShouldPersistTaps="handled">
        {open ? (
          <Card style={{ gap: 16 }}>
            {!open.apps.includes('phone') && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="computer" size={16} color={colors.primary} />
                <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.primary }}>On the Stockpot website</Text>
              </View>
            )}
            <View style={{ gap: 4 }}>
              <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, color: colors.ink }}>{open.title}</Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.grey }}>{open.summary}</Text>
            </View>
            {open.body.map((b, i) => <Block key={i} block={b} />)}
          </Card>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, backgroundColor: colors.card, paddingHorizontal: 12 }}>
              <MaterialIcons name="search" size={22} color={colors.grey} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Search help" placeholderTextColor={colors.grey} accessibilityLabel="Search help" returnKeyType="search"
                style={[{ flex: 1, minHeight: 52, fontFamily: fonts.regular, fontSize: 16, color: colors.ink }, noOutline]} />
              {query ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} hitSlop={8}>
                  <MaterialIcons name="close" size={20} color={colors.grey} />
                </Pressable>
              ) : null}
            </View>

            {results ? (
              results.length === 0 ? (
                <Text style={{ fontFamily: fonts.regular, fontSize: 15, color: colors.grey, textAlign: 'center' }}>Nothing matches “{query.trim()}”. Try a shorter word, such as “bill” or “stock”.</Text>
              ) : <Section title={`${results.length} found`} topics={results} onOpen={openTopic} />
            ) : (
              <>
                {PHONE_SECTIONS.map(s => <Section key={s.id} title={s.title} topics={s.topics} onOpen={openTopic} />)}
                <Section title="On the Stockpot website" topics={WEB_ONLY} onOpen={openTopic} />
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

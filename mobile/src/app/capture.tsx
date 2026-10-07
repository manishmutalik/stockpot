import React from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Currency, QuickKind } from '../../../src/utils/quickApiTypes';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Notes, OrderConfirm, PaymentConfirm, ProductionConfirm, RestockConfirm } from '../components/confirm';
import { QuestionCard } from '../components/QuestionCard';
import { canSave, currentQuestion, questionProgress } from '../lib/capture';
import { useReadingLabel } from '../lib/readingLabel';
import { useVoiceInput } from '../lib/useVoiceInput';
import { useCapture } from '../lib/useCapture';
import { noOutline } from '../lib/webInput';
import { colors, fonts, radius } from '../theme';

const KINDS: QuickKind[] = ['order', 'restock', 'production', 'payment'];
const TITLE: Record<QuickKind | 'none', string> = { order: 'New order', restock: 'Stock in', production: 'Production', payment: 'Payment', none: 'Tell Stockpot' };
const HINT: Record<QuickKind | 'none', string> = {
  order: 'e.g. Priya, two chocolate truffle cakes for Saturday evening, five hundred advance on UPI',
  restock: 'e.g. Bought five kilo maida for four fifty and two litres milk for one twenty',
  production: 'e.g. Made forty croissants this morning, three burnt',
  payment: 'e.g. Priya paid the remaining thirteen hundred by UPI',
  none: 'Say what happened: an order, stock you bought, something you made, or a payment',
};
const DEFAULT_CURRENCY: Currency = { code: 'INR', symbol: '₹' };

export default function Capture() {
  const params = useLocalSearchParams<{ kind?: string; resume?: string; listen?: string }>();
  const kind = (KINDS as string[]).includes(params.kind ?? '') ? (params.kind as QuickKind) : null;
  const { api, isDemo } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cap = useCapture(api, { kind, resume: params.resume === '1' });
  const { state } = cap;
  const readingText = useReadingLabel(state.step === 'reading');
  const response = state.response;
  const currency = response?.currency ?? DEFAULT_CURRENCY;
  const shownKind: QuickKind | 'none' = response?.kind ?? kind ?? 'none';

  const leave = () => router.back();
  const back = () => (state.step === 'write' || state.step === 'saved' ? leave() : cap.edit());

  const requireAccount = (): boolean => {
    if (!isDemo) return true;
    Alert.alert('Not available in the demo', 'Voice and typed entry are not available in the demo kitchen. Sign in with your own account to use them.');
    return false;
  };
  // Speaking fills the text box as the words are heard; the owner checks it and taps Read it, so nothing is read (or counted) unseen.
  const textRef = React.useRef(state.text);
  textRef.current = state.text;
  const voice = useVoiceInput({ getText: () => textRef.current, setText: cap.setText });
  const read = () => { if (!requireAccount()) return; voice.stop(); cap.read(); };
  const mic = () => { if (requireAccount()) void voice.toggle(); };
  // The big mic on Today opens this screen already listening.
  React.useEffect(() => { if (params.listen === '1') mic(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveLabel = (() => {
    if (!response?.draft) return 'Save';
    if (response.kind === 'order') return response.preview?.label ? `${response.draft.common.preorder ? 'Book pre-order' : 'Save order'} ${response.preview.label.total}` : 'Save order';
    if (response.kind === 'restock') return response.preview ? `Save stock ${response.preview.label.total}` : 'Save stock';
    if (response.kind === 'production') return 'Log production';
    if (response.kind === 'payment') return response.preview ? `Save payment ${response.preview.label.amount}` : 'Save payment';
    return 'Save';
  })();

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 8, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={state.step === 'write' || state.step === 'saved' ? 'Close' : 'Back to what I said'} onPress={back} hitSlop={8} style={{ padding: 10 }}>
          <MaterialIcons name={state.step === 'write' || state.step === 'saved' ? 'close' : 'arrow-back'} size={24} color={colors.ink} />
        </Pressable>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.ink }}>{TITLE[shownKind]}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 16 }} keyboardShouldPersistTaps="handled">
        {state.error && (
          <View accessibilityRole="alert" style={{ backgroundColor: `${colors.coral}14`, borderRadius: radius.md, padding: 12 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.coral }}>{state.error}</Text>
          </View>
        )}

        {(state.step === 'write' || state.step === 'reading') && (
          <>
            <Card style={{ gap: 12, borderWidth: 2, borderColor: colors.primary }}>
              <TextInput
                value={state.text} onChangeText={cap.setText} editable={state.step === 'write' && !voice.listening} autoFocus={params.listen !== '1'} multiline maxLength={2000}
                placeholder={HINT[shownKind]} placeholderTextColor={colors.grey} accessibilityLabel="What happened"
                style={[{ fontFamily: fonts.regular, fontSize: 20, lineHeight: 28, color: colors.ink, minHeight: 140, textAlignVertical: 'top' }, noOutline]}
              />
              <Text style={{ alignSelf: 'flex-end', fontFamily: fonts.mono, fontSize: 12, color: colors.grey }}>{state.text.trim() ? state.text.trim().split(/\s+/).length : 0} words</Text>
            </Card>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Pressable accessibilityRole="button" accessibilityLabel={voice.listening ? 'Stop listening' : 'Speak'} accessibilityState={{ selected: voice.listening }} onPress={mic}
                style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, backgroundColor: voice.listening ? colors.coral : pressed ? colors.primaryPressed : colors.primary, alignItems: 'center', justifyContent: 'center' })}>
                <MaterialIcons name={voice.listening ? 'stop' : 'mic'} size={26} color={colors.white} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Button label={state.step === 'reading' ? readingText : 'Read it'} onPress={read} busy={state.step === 'reading'} disabled={!state.text.trim()} icon={<MaterialIcons name="auto-awesome" size={20} color={colors.white} />} />
              </View>
            </View>
            {voice.listening && (
              <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.coral, textAlign: 'center' }}>Listening… say it, then tap the square to stop.</Text>
            )}
            {voice.error && !voice.listening && (
              <Text accessibilityRole="alert" style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.coral, textAlign: 'center' }}>{voice.error}</Text>
            )}
            <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey, textAlign: 'center' }}>Nothing is saved until you confirm it.</Text>
          </>
        )}

        {state.step === 'ask' && (() => {
          const q = currentQuestion(state);
          if (!q) return null;
          const { number, of } = questionProgress(state);
          return <QuestionCard key={q.id} question={q} kind={response?.kind ?? kind} number={number} of={of} busy={false} onAnswer={v => cap.answer(q.id, v)} />;
        })()}

        {(state.step === 'confirm' || state.step === 'saving') && response?.draft && (
          <>
            {response.kind === 'order' && <OrderConfirm draft={response.draft} preview={response.preview} currency={currency} />}
            {response.kind === 'restock' && <RestockConfirm preview={response.preview} currency={currency} />}
            {response.kind === 'production' && <ProductionConfirm preview={response.preview} currency={currency} accepted={state.shortageAccepted} onAccept={cap.acceptShortage} />}
            {response.kind === 'payment' && <PaymentConfirm draft={response.draft} preview={response.preview} />}
            <Notes notes={response.notes} />
            <Button label={saveLabel} onPress={cap.save} busy={state.step === 'saving'} disabled={!canSave(state)} icon={<MaterialIcons name="check" size={22} color={colors.white} />} />
            <Pressable accessibilityRole="button" onPress={cap.edit} style={{ alignSelf: 'center', padding: 8 }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.primary }}>Change what I said</Text>
            </Pressable>
          </>
        )}

        {state.step === 'reading' && state.response === null && state.text.trim() !== '' && (
          <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.grey }}>{readingText}</Text>
          </View>
        )}

        {state.step === 'saved' && state.saved && (
          <View style={{ alignItems: 'center', gap: 16, paddingTop: 24 }}>
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: `${colors.green}1F`, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialIcons name="check" size={48} color={colors.green} />
            </View>
            <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 24, color: colors.ink }}>{state.saved.title}</Text>
            <Card style={{ alignSelf: 'stretch', gap: 6 }}>
              {state.saved.lines.map(l => <Text key={l} style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{l}</Text>)}
            </Card>
            {!!state.saved.warning && (
              <View style={{ alignSelf: 'stretch', backgroundColor: '#FFF4E0', borderRadius: radius.md, padding: 12 }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.amber }}>{state.saved.warning}</Text>
              </View>
            )}
            <View style={{ alignSelf: 'stretch' }}><Button label="Done" onPress={leave} /></View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

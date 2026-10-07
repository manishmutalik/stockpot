import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL, useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EVENING_TIMES, MORNING_TIMES, timeLabel, withSwitch, withTime } from '../../lib/notifications';
import { pushFailureMessage, pushPermission, registerForPush, type PushPermission } from '../../lib/push';
import { useNotificationSettings } from '../../lib/useNotificationSettings';
import { colors, fonts, radius } from '../../theme';

const caption = { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.grey } as const;

function Row({ title, hint, value, onChange, disabled, children }: {
  title: string; hint: string; value: boolean; onChange: (on: boolean) => void; disabled?: boolean; children?: React.ReactNode;
}) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{title}</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey }}>{hint}</Text>
        </View>
        <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.primary, false: colors.outline }} accessibilityLabel={title} />
      </View>
      {value && children}
    </View>
  );
}

function TimeChips({ label, times, current, onPick }: { label: string; times: string[]; current: string; onPick: (t: string) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={caption}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {times.map(t => {
          const on = t === current;
          return (
            <Pressable key={t} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onPick(t)}
              style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.full, backgroundColor: on ? colors.primary : colors.inputFill }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: on ? colors.white : colors.ink }}>{timeLabel(t)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function Settings() {
  const { user, isDemo, api, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const prefs = useNotificationSettings(api, !isDemo);
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [turningOn, setTurningOn] = useState(false);

  // Whether this phone may show notifications can change outside the app (in the phone's settings), so look again on each visit.
  useFocusEffect(useCallback(() => { if (!isDemo) pushPermission().then(setPermission).catch(() => setPermission('unsupported')); }, [isDemo]));
  useEffect(() => { setPushError(null); }, [permission]);

  const turnOn = async () => {
    setTurningOn(true); setPushError(null);
    const result = await registerForPush(api, { ask: true });
    setTurningOn(false);
    setPermission(await pushPermission().catch(() => 'unsupported' as const));
    if (!result.ok) setPushError(pushFailureMessage(result.reason));
  };

  const confirmSignOut = () => Alert.alert('Sign out?', isDemo ? 'The demo kitchen will be gone once you leave it.' : 'You will need your email and password to sign back in.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => { signOut().catch(() => {}); } },
  ]);

  const s = prefs.settings;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, paddingHorizontal: 16, gap: 20 }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 24, color: colors.ink }}>Settings</Text>

      <Card style={{ gap: 4 }}>
        <Text style={caption}>SIGNED IN AS</Text>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{isDemo ? 'Demo kitchen' : (user?.email ?? '')}</Text>
      </Card>

      <View style={{ gap: 12 }}>
        <Text style={caption}>NOTIFICATIONS</Text>
        {isDemo ? (
          <Card><Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.grey }}>Notifications are not available in the demo kitchen.</Text></Card>
        ) : (
          <Card style={{ gap: 16 }}>
            {permission !== 'granted' && permission !== null && (
              <View style={{ gap: 10, backgroundColor: colors.inputFill, borderRadius: radius.md, padding: 14 }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>
                  {permission === 'denied' ? 'Notifications are blocked for Stockpot Quick' : 'Notifications are off for this phone'}
                </Text>
                {permission === 'unsupported'
                  ? <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey }}>{pushFailureMessage('unsupported')}</Text>
                  : permission === 'denied'
                    ? <Button label="Open phone settings" onPress={() => { Linking.openSettings().catch(() => {}); }} />
                    : <Button label="Turn on notifications" onPress={turnOn} busy={turningOn} icon={<MaterialIcons name="notifications-active" size={20} color={colors.white} />} />}
                {!!pushError && <Text accessibilityRole="alert" style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.coral }}>{pushError}</Text>}
              </View>
            )}
            {permission === 'granted' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="check-circle" size={20} color={colors.green} />
                <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.green }}>Notifications are on for this phone</Text>
              </View>
            )}

            {prefs.loading && <ActivityIndicator color={colors.primary} />}
            {!!prefs.error && (
              <View style={{ gap: 8 }}>
                <Text accessibilityRole="alert" style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.coral }}>{prefs.error}</Text>
                {!s && <Button variant="soft" label="Try again" onPress={prefs.reload} />}
              </View>
            )}
            {s && (
              <>
                <Row title="Morning summary" hint="What needs doing today, in one notification" value={s.morningSummary.enabled} onChange={on => prefs.change(withSwitch(s, 'morningSummary', on))}>
                  <TimeChips label="SEND AT" times={MORNING_TIMES} current={s.morningSummary.time} onPick={t => prefs.change(withTime(s, 'morningSummary', t))} />
                </Row>
                <Row title="Running low" hint="Once, when an ingredient drops below its alert level" value={s.lowStock} onChange={on => prefs.change(withSwitch(s, 'lowStock', on))} />
                <Row title="Use by soon" hint="Ingredients and batches within two days of their date" value={s.useBy} onChange={on => prefs.change(withSwitch(s, 'useBy', on))} />
                <Row title="Due tomorrow" hint="An evening reminder of tomorrow's pre-orders" value={s.dueTomorrow.enabled} onChange={on => prefs.change(withSwitch(s, 'dueTomorrow', on))}>
                  <TimeChips label="SEND AT" times={EVENING_TIMES} current={s.dueTomorrow.time} onPick={t => prefs.change(withTime(s, 'dueTomorrow', t))} />
                </Row>
                <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.grey }}>Times are in your kitchen's time zone, and each kind is sent at most once a day.</Text>
              </>
            )}
          </Card>
        )}
      </View>

      <Pressable accessibilityRole="link" onPress={() => { if (API_URL) Linking.openURL(API_URL).catch(() => {}); }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, opacity: pressed ? 0.8 : 1 })}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>Open Stockpot on the web</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey }}>Recipes, costs, suppliers and reports</Text>
        </View>
        <MaterialIcons name="open-in-new" size={22} color={colors.grey} />
      </Pressable>

      <Button variant="quiet" label="Sign out" onPress={confirmSignOut} />
      <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.grey, textAlign: 'center' }}>Stockpot Quick {Constants.expoConfig?.version ?? ''}</Text>
    </ScrollView>
  );
}

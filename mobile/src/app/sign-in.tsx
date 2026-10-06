import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL, useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { describeAuthError } from '../lib/authErrors';
import { describeApiError } from '../lib/api';
import { colors, fonts, radius } from '../theme';

export default function SignIn() {
  const { signIn, resetPassword, openDemo } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<null | 'signIn' | 'demo'>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setError(null); setBusy('signIn');
    try { await signIn(email, password); } catch (err) { setError(describeAuthError(err, 'signIn')); } finally { setBusy(null); }
  };

  const forgot = async () => {
    if (!email.trim()) { setError('Enter your email address first, then tap Forgot password.'); return; }
    setError(null);
    try { await resetPassword(email); Alert.alert('Check your email', 'If that address has an account, a reset link is on its way.'); }
    catch (err) { setError(describeAuthError(err, 'reset')); }
  };

  const demo = async () => {
    setError(null); setBusy('demo');
    try { await openDemo(); } catch (err: any) { setError(err?.code ? describeAuthError(err, 'demo') : describeApiError(err)); } finally { setBusy(null); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32, paddingHorizontal: 16, gap: 20 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Image source={require('../../assets/logo-full.png')} style={{ width: 240, height: 135 }} resizeMode="contain" accessibilityLabel="Stockpot" />
          <Text style={{ fontFamily: fonts.regular, fontSize: 18, color: colors.grey }}>The CFO of your food business</Text>
          <View style={{ backgroundColor: colors.inputFill, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8, marginTop: 8 }}>
            <Text style={{ fontFamily: fonts.mono, fontSize: 12, letterSpacing: 2, color: colors.ink }}>KITCHEN WORKSPACE</Text>
          </View>
        </View>

        <Card style={{ gap: 12, padding: 20 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>Email address</Text>
          <Field icon="mail-outline">
            <TextInput
              value={email} onChangeText={setEmail} placeholder="you@yourkitchen.in" placeholderTextColor={colors.grey}
              autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" textContentType="emailAddress"
              style={inputText}
            />
          </Field>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink, marginTop: 4 }}>Password</Text>
          <Field icon="lock-outline" right={
            <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword(s => !s)} hitSlop={12}>
              <MaterialIcons name={showPassword ? 'visibility' : 'visibility-off'} size={22} color={colors.ink} />
            </Pressable>
          }>
            <TextInput
              value={password} onChangeText={setPassword} placeholder="Your password" placeholderTextColor={colors.grey}
              secureTextEntry={!showPassword} autoCapitalize="none" autoComplete="password" textContentType="password" onSubmitEditing={submit}
              style={inputText}
            />
          </Field>
          <Pressable accessibilityRole="button" onPress={forgot} style={{ alignSelf: 'flex-end', paddingVertical: 4 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.primary }}>Forgot password?</Text>
          </Pressable>
          {error && <Text accessibilityRole="alert" style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.coral }}>{error}</Text>}
          <Button label="Sign in" onPress={submit} busy={busy === 'signIn'} disabled={busy === 'demo'} icon={<MaterialIcons name="login" size={22} color={colors.white} />} />
        </Card>

        {/* Apple restricts apps that send people elsewhere to buy a subscription, so on iOS this link stays out until that is checked. */}
        {Platform.OS !== 'ios' && (
          <Text style={{ fontFamily: fonts.regular, fontSize: 16, color: colors.ink, textAlign: 'center', lineHeight: 24 }}>
            New here?{' '}
            <Text accessibilityRole="link" onPress={() => Linking.openURL(API_URL)  /* the server also serves the website */} style={{ fontFamily: fonts.semibold, color: colors.primary }}>
              Start your free trial on the Stockpot website
            </Text>
          </Text>
        )}

        <Button variant="quiet" label="Try the demo kitchen" onPress={demo} busy={busy === 'demo'} disabled={busy === 'signIn'} icon={<MaterialIcons name="restaurant" size={22} color={colors.primary} />} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const inputText = { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingVertical: 14 } as const;

function Field({ icon, right, children }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.inputFill, borderRadius: radius.md, paddingHorizontal: 16 }}>
      <MaterialIcons name={icon} size={22} color={colors.ink} />
      {children}
      {right}
    </View>
  );
}

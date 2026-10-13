import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RecipeSetupView, RecipesSaved } from '../../../src/utils/quickApiTypes';
import { RECIPE_MAX_PHOTOS } from '../../../src/utils/recipeParse';
import { buildDraft, draftIssues, draftToImport, type RecipeDraft } from '../../../src/utils/recipeDraft';
import { useAuth } from '../auth/AuthContext';
import { ApiError, describeApiError } from '../lib/api';
import { loadRecipeAvailability, loadRecipeSetup, readRecipe, recipeReadingLabel, recipesToSave, savedSummary, saveRecipes, type RecipeAvailability } from '../lib/recipeReader';
import { pickRecipePhotos, type PickedPhoto } from '../lib/recipePhotos';
import { noOutline } from '../lib/webInput';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { NewMaterialsCard, RecipeCheckCard } from '../components/recipe/RecipeCheckCard';
import { Choices } from '../components/recipe/fields';
import { colors, fonts, radius } from '../theme';

/**
 * Read a recipe: photograph a notebook page or a printed recipe (up to three pages), or type it, and the recipe reader reads
 * every recipe on it. The check screen then shows one card per recipe, every ingredient matched to a material and worked
 * out for one item, with any question asked in place; Save adds them to the menu (lib/recipeReader). Nothing is saved
 * before Save, and photos are not kept.
 */
type Step = 'input' | 'reading' | 'check' | 'saving' | 'saved';
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function useElapsed(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return elapsed;
}

export default function ReadRecipe() {
  const { api } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [availability, setAvailability] = useState<RecipeAvailability | null>(null);
  const [setup, setSetup] = useState<RecipeSetupView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('input');
  const [mode, setMode] = useState<'photo' | 'text'>('photo');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [saved, setSaved] = useState<RecipesSaved | null>(null);
  const [tried, setTried] = useState(false);
  const saveKey = useRef<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const elapsed = useElapsed(step === 'reading');

  const load = async () => {
    setLoadError(null);
    const [a, s] = await Promise.all([
      loadRecipeAvailability(api),
      loadRecipeSetup(api).catch((err: unknown) => { setLoadError(describeApiError(err)); return null; }),
    ]);
    setAvailability(a);
    setSetup(s);
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const materials = setup?.materials ?? [];
  const menu = setup?.menu ?? [];
  const issues = useMemo(() => (draft ? draftIssues(draft, materials, menu) : []), [draft, materials, menu]);
  const issueLines = useMemo(() => new Set(issues.map(i => i.lineKey).filter((k): k is string => !!k)), [issues]);
  const update = (fn: (d: RecipeDraft) => void) => { saveKey.current = null; setDraft(d => { if (!d) return d; const c = clone(d); fn(c); return c; }); };
  const remaining = availability?.available ? availability.remaining : null;

  const addPhotos = async (from: 'camera' | 'gallery') => {
    if (picking) return;
    setError(null); setPicking(true);
    const result = await pickRecipePhotos(from, RECIPE_MAX_PHOTOS - photos.length);
    setPicking(false);
    if (result.ok) setPhotos(p => [...p, ...result.photos].slice(0, RECIPE_MAX_PHOTOS));
    else if ('message' in result) setError(result.message);
  };

  const read = async () => {
    if (!setup) return;
    setError(null); setStep('reading');
    const outcome = await readRecipe(api, mode === 'text' ? { text } : { photos: photos.map(p => p.photo) }, setup.materials);
    if (outcome.remaining !== undefined) setAvailability(a => (a?.available ? { ...a, remaining: outcome.remaining! } : a));
    if (outcome.ok === false) { setError(outcome.message); setStep('input'); return; }
    setDraft(buildDraft(outcome.parsed, { materials: setup.materials, menu: setup.menu, fromPhotos: mode === 'photo' }));
    setTried(false); saveKey.current = null;
    setStep('check');
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  const save = async () => {
    if (!draft || !setup) return;
    setTried(true);
    const data = draftToImport(draft, setup.materials, setup.menu);
    if (!data) { scroll.current?.scrollToEnd({ animated: true }); return; }
    setError(null); setStep('saving');
    saveKey.current = saveKey.current ?? randomUUID();
    try {
      setSaved(await saveRecipes(api, data, saveKey.current));
      setStep('saved');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? 'No connection. Nothing was saved; try again when you are back online.' : describeApiError(err));
      setStep('check');
    }
  };

  const startAgain = () => {
    setDraft(null); setSaved(null); setPhotos([]); setText(''); setError(null); setStep('input');
    void load();
  };
  const leave = () => {
    if (step === 'check' && draft) {
      Alert.alert('Leave without saving?', 'The recipes you checked will not be saved.', [
        { text: 'Keep checking', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => router.back() },
      ]);
      return;
    }
    router.back();
  };

  const canRead = !!setup && (mode === 'text' ? text.trim() !== '' : photos.length > 0) && remaining !== 0;
  const count = draft ? recipesToSave(draft) : 0;
  const summary = saved ? savedSummary(saved) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 8, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={leave} hitSlop={8} style={{ padding: 10 }}>
          <MaterialIcons name="close" size={24} color={colors.ink} />
        </Pressable>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.ink, flex: 1 }}>{step === 'check' || step === 'saving' ? 'Check the recipe' : 'Read a recipe'}</Text>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 16 }} keyboardShouldPersistTaps="handled">
        {error && (
          <View accessibilityRole="alert" style={{ backgroundColor: `${colors.coral}14`, borderRadius: radius.md, padding: 12 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.coral }}>{error}</Text>
          </View>
        )}

        {(step === 'input' || step === 'reading') && (
          availability === null ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
          ) : availability.available === false ? (
            <Card style={{ gap: 12 }}>
              <MaterialIcons name="menu-book" size={32} color={colors.grey} />
              <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{availability.message}</Text>
            </Card>
          ) : loadError || !setup ? (
            <Card style={{ gap: 12 }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{loadError ?? 'Could not load your materials.'}</Text>
              <Button label="Try again" variant="soft" onPress={() => void load()} />
            </Card>
          ) : (
            <>
              <Text style={{ fontFamily: fonts.regular, fontSize: 15, color: colors.grey }}>
                Photograph a recipe from your notebook, a printout or a screenshot, or type it. Every recipe on the page is read, and you check it before anything is saved.
              </Text>
              <Choices label="How to add the recipe" value={mode} options={[{ value: 'photo', label: 'Photo' }, { value: 'text', label: 'Type it' }]} onChange={m => { setMode(m); setError(null); }} />

              {mode === 'photo' ? (
                <Card style={{ gap: 14 }}>
                  {photos.length > 0 && (
                    <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                      {photos.map((p, i) => (
                        <View key={p.uri} style={{ width: 96, height: 128, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.inputFill }}>
                          <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel={`Page ${i + 1}`} />
                          {step === 'input' && (
                            <Pressable accessibilityRole="button" accessibilityLabel={`Remove page ${i + 1}`} onPress={() => setPhotos(ps => ps.filter(x => x.uri !== p.uri))} hitSlop={6}
                              style={{ position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(43,49,61,0.7)', alignItems: 'center', justifyContent: 'center' }}>
                              <MaterialIcons name="close" size={18} color={colors.white} />
                            </Pressable>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                  {photos.length < RECIPE_MAX_PHOTOS && step === 'input' && (
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Button variant="soft" label={photos.length ? 'Another page' : 'Take photo'} busy={picking} onPress={() => void addPhotos('camera')} icon={<MaterialIcons name="photo-camera" size={20} color={colors.primary} />} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button variant="soft" label="Gallery" disabled={picking} onPress={() => void addPhotos('gallery')} icon={<MaterialIcons name="photo-library" size={20} color={colors.primary} />} />
                      </View>
                    </View>
                  )}
                  <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey }}>
                    Hold the phone straight over the page in good light. A recipe that runs over the page: add both pages, up to {RECIPE_MAX_PHOTOS}.
                  </Text>
                </Card>
              ) : (
                <Card style={{ borderWidth: 2, borderColor: colors.primary }}>
                  <TextInput
                    value={text} onChangeText={setText} editable={step === 'input'} multiline maxLength={6000} accessibilityLabel="The recipe"
                    placeholder={'e.g. Vanilla cupcakes, makes 12\n2 cups maida\n1 cup sugar\n2 eggs\n1 tsp vanilla essence'} placeholderTextColor={colors.grey}
                    style={[{ fontFamily: fonts.regular, fontSize: 17, lineHeight: 24, color: colors.ink, minHeight: 180, textAlignVertical: 'top' }, noOutline]}
                  />
                </Card>
              )}

              <Button
                label={step === 'reading' ? recipeReadingLabel(elapsed) : 'Read recipe'} onPress={() => void read()} busy={step === 'reading'} disabled={!canRead}
                icon={<MaterialIcons name="auto-awesome" size={20} color={colors.white} />}
              />
              {remaining !== null && (
                <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: remaining === 0 ? colors.coral : colors.grey, textAlign: 'center' }}>
                  {remaining === 0 ? 'You have read all the recipes you can for now. You can read more tomorrow.' : `You can read ${remaining} more ${remaining === 1 ? 'recipe' : 'recipes'} today. A page with several recipes counts each one.`}
                </Text>
              )}
            </>
          )
        )}

        {(step === 'check' || step === 'saving') && draft && setup && (
          <>
            <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.grey }}>
              {draft.recipes.length === 1 ? 'Here is what was read.' : `${draft.recipes.length} recipes were read.`} Check each ingredient’s material and amount; anything marked needs an answer before you save.
            </Text>
            {draft.moreNotRead && (
              <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.amber }}>The page had more recipes than are read at once. Photograph the rest separately.</Text>
            )}
            {draft.recipes.map(r => (
              <RecipeCheckCard key={r.key} draft={draft} recipe={r} setup={{ materials, menu, symbol: setup.currency.symbol }} update={update} issueLines={issueLines} single={draft.recipes.length === 1} />
            ))}
            <NewMaterialsCard draft={draft} symbol={setup.currency.symbol} update={update} />
            {tried && issues.length > 0 && (
              <View accessibilityRole="alert" style={{ gap: 6, padding: 12, borderRadius: radius.md, backgroundColor: `${colors.amber}1A` }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.ink }}>Still to settle</Text>
                {issues.slice(0, 8).map((i, n) => <Text key={n} style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.ink }}>• {i.message}</Text>)}
                {issues.length > 8 && <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.grey }}>and {issues.length - 8} more</Text>}
              </View>
            )}
            <Button
              label={count === 1 ? 'Save recipe' : `Save ${count} recipes`} onPress={() => void save()} busy={step === 'saving'} disabled={count === 0}
              icon={<MaterialIcons name="check" size={22} color={colors.white} />}
            />
            <Pressable accessibilityRole="button" onPress={startAgain} style={{ alignSelf: 'center', padding: 8 }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.primary }}>Start again</Text>
            </Pressable>
          </>
        )}

        {step === 'saved' && summary && (
          <Card style={{ gap: 12, alignItems: 'center', paddingVertical: 32 }}>
            <MaterialIcons name="check-circle" size={48} color={colors.green} />
            <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.ink }}>{summary.title}</Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 15, color: colors.grey, textAlign: 'center' }}>{summary.detail}</Text>
            <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 8 }}>
              <Button label="Read another recipe" variant="soft" onPress={startAgain} icon={<MaterialIcons name="menu-book" size={20} color={colors.primary} />} />
              <Button label="Done" onPress={() => router.back()} />
            </View>
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

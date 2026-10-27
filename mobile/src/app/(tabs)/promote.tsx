import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { postText, PROMOTE_LABEL, PROMOTE_LANGUAGES, PROMOTE_SHAPES, shapeOf, type PromoteLanguage, type PromoteResult, type PromoteShapeId } from '../../../../src/utils/promote';
import { PLAIN_BACKDROPS, SCENE_BACKDROPS } from '../../../../src/utils/promoteBackdrops';
import { useAuth } from '../../auth/AuthContext';
import { loadPromoteAvailability, placeBackground, promotePhoto, promoteWorkingLabel, type PromoteAvailability } from '../../lib/promote';
import { copyCaption, cropForShare, forget, keepImproved, pickPromotePhoto, sharePost, type PickedPromotePhoto } from '../../lib/promotePhoto';
import { noOutline } from '../../lib/webInput';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Choices } from '../../components/recipe/fields';
import { colors, fonts, radius } from '../../theme';

/**
 * Promote: take or choose a photo of something you make; it comes back brighter, cropped for Instagram, with a caption and
 * hashtags (lib/promote). Share opens the share sheet with the photo and copies the caption to paste. Photos are not kept:
 * the files this screen makes are in the app's cache and are deleted when the owner starts again or leaves.
 */
type Stage = 'pick' | 'working' | 'done';

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

export default function Promote() {
  const { api } = useAuth();
  const insets = useSafeAreaInsets();
  const [availability, setAvailability] = useState<PromoteAvailability | null>(null);
  const [stage, setStage] = useState<Stage>('pick');
  const [language, setLanguage] = useState<PromoteLanguage>('en');
  const [picked, setPicked] = useState<PickedPromotePhoto | null>(null);
  const [result, setResult] = useState<PromoteResult | null>(null);
  const [improvedUri, setImprovedUri] = useState<string | null>(null);
  const [shape, setShape] = useState<PromoteShapeId>('post');
  const [cropped, setCropped] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState<{ tag: string; on: boolean }[]>([]);
  const [withOrder, setWithOrder] = useState(true);
  const [showBefore, setShowBefore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Backgrounds: the one chosen ('original' is the improved photo), each made so far (going back to one is free), and
  // the mask the first one made, sent with the rest.
  const [backdrop, setBackdrop] = useState('original');
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [mask, setMask] = useState<string | null>(null);
  const [making, setMaking] = useState<string | null>(null);
  const files = useRef<string[]>([]);
  const elapsed = useElapsed(stage === 'working');

  const track = (uri: string) => { files.current.push(uri); return uri; };
  const clearFiles = () => { forget(files.current); files.current = []; };
  useEffect(() => {
    void loadPromoteAvailability(api).then(setAvailability);
    return clearFiles;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shownUri = variants[backdrop] ?? improvedUri;
  // The improved photo cut to the chosen shape, made again whenever the shape or the photo changes.
  useEffect(() => {
    if (!result || !shownUri) return;
    let cancelled = false;
    setCropped(null);
    cropForShare(shownUri, result, shapeOf(shape), result.reading.focus)
      .then(uri => { track(uri); if (!cancelled) setCropped(uri); })
      .catch(() => { if (!cancelled) setError('That photo could not be cropped. Please try again.'); });
    return () => { cancelled = true; };
  }, [result, shownUri, shape]);

  const remaining = availability?.available ? availability.remaining : null;

  const send = async (photo: PickedPromotePhoto) => {
    setError(null); setNote(null); setShowBefore(false); setStage('working');
    const outcome = await promotePhoto(api, photo.photo, language);
    if (outcome.remaining !== undefined) setAvailability(a => (a?.available ? { ...a, remaining: outcome.remaining! } : a));
    if (outcome.ok === false) { setError(outcome.message); setStage(result ? 'done' : 'pick'); return; }
    try {
      setImprovedUri(track(keepImproved(outcome.result.image)));
    } catch {
      setError('That photo could not be kept on this phone. Please try again.'); setStage('pick'); return;
    }
    setBackdrop('original'); setVariants({}); setMask(null);
    setResult(outcome.result);
    setCaption(outcome.result.reading.caption);
    setTags(outcome.result.reading.hashtags.map(tag => ({ tag, on: true })));
    setStage('done');
  };

  const choose = async (from: 'camera' | 'gallery') => {
    if (busy) return;
    setError(null); setBusy(true);
    const pick = await pickPromotePhoto(from);
    setBusy(false);
    if (pick.ok) { track(pick.picked.uri); setPicked(pick.picked); void send(pick.picked); }
    else if ('message' in pick) setError(pick.message);
  };

  const startAgain = () => {
    clearFiles();
    setPicked(null); setResult(null); setImprovedUri(null); setCropped(null); setError(null); setNote(null); setStage('pick');
    setBackdrop('original'); setVariants({}); setMask(null);
  };

  const backgrounds = availability?.available ? availability.backgrounds : null;
  const chooseBackdrop = async (id: string) => {
    setError(null);
    if (id === 'original' || variants[id]) { setBackdrop(id); return; }
    if (!result || making) return;
    setMaking(id);
    const outcome = await placeBackground(api, result.image, mask, id);
    setMaking(null);
    const left = outcome.ok ? outcome.result.scenesLeft : outcome.scenesLeft;
    if (left !== undefined) setAvailability(a => (a?.available && a.backgrounds ? { ...a, backgrounds: { scenesLeft: left } } : a));
    if (outcome.ok === false) { setError(outcome.message); return; }
    try {
      const uri = track(keepImproved(outcome.result.image));
      if (outcome.result.mask) setMask(outcome.result.mask);
      setVariants(v => ({ ...v, [id]: uri }));
      setBackdrop(id);
    } catch {
      setError('That photo could not be kept on this phone. Please try again.');
    }
  };

  const text = result ? postText(caption, tags.filter(t => t.on).map(t => t.tag), withOrder ? result.orderLine : null) : '';
  const share = async () => {
    if (!cropped) return;
    try {
      const shared = await sharePost(cropped, text);
      setNote(shared ? 'Caption copied: Instagram leaves it out, so paste it there.' : 'Caption copied, but this phone cannot share photos.');
    } catch {
      setError('The photo could not be shared. Please try again.');
    }
  };
  const copy = async () => { await copyCaption(text); setNote('Caption copied.'); };

  const shapeInfo = shapeOf(shape);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 32, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 4 }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 24, color: colors.ink }}>{PROMOTE_LABEL}</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 15, color: colors.grey }}>
            Take or choose a photo of something you make. It comes back brighter and cropped for Instagram, with a caption and hashtags.
          </Text>
        </View>

        {error && (
          <View accessibilityRole="alert" style={{ backgroundColor: `${colors.coral}14`, borderRadius: radius.md, padding: 12 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.coral }}>{error}</Text>
          </View>
        )}

        {availability === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
        ) : availability.available === false ? (
          <Card style={{ gap: 12 }}>
            <MaterialIcons name="campaign" size={32} color={colors.grey} />
            <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{availability.message}</Text>
          </Card>
        ) : stage === 'pick' ? (
          <Card style={{ gap: 14 }}>
            <Button label="Take a photo" busy={busy} disabled={remaining === 0} onPress={() => void choose('camera')} icon={<MaterialIcons name="photo-camera" size={20} color={colors.white} />} />
            <Button label="Choose a photo" variant="soft" disabled={busy || remaining === 0} onPress={() => void choose('gallery')} icon={<MaterialIcons name="photo-library" size={20} color={colors.primary} />} />
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>Caption in</Text>
            <Choices label="Caption in" value={language} options={PROMOTE_LANGUAGES} onChange={setLanguage} />
            <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: remaining === 0 ? colors.coral : colors.grey }}>
              The food stays exactly as you made it: only the light, colour and framing are improved. Photos are not kept.
              {remaining !== null && (remaining === 0 ? ' No more photos today: try again tomorrow.' : ` ${remaining} left today.`)}
            </Text>
          </Card>
        ) : stage === 'working' ? (
          <Card style={{ gap: 14, alignItems: 'center' }}>
            {picked && <Image source={{ uri: picked.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, opacity: 0.6 }} resizeMode="contain" accessibilityLabel="Your photo" />}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{promoteWorkingLabel(elapsed)}</Text>
            </View>
          </Card>
        ) : result && (
          <>
            <Card style={{ gap: 12 }}>
              <Choices label="Shape" value={shape} options={PROMOTE_SHAPES.map(s => ({ value: s.id, label: `${s.label} ${s.hint}` }))} onChange={setShape} />
              <View style={{ width: '100%', aspectRatio: shapeInfo.width / shapeInfo.height, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.inputFill, alignItems: 'center', justifyContent: 'center' }}>
                {showBefore && picked
                  ? <Image source={{ uri: picked.uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessibilityLabel="Your photo as taken" />
                  : cropped
                    ? <Image source={{ uri: cropped }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel={`Your photo, improved, as a ${shapeInfo.label.toLowerCase()}`} />
                    : <ActivityIndicator color={colors.primary} />}
                {picked && (
                  <Pressable accessibilityRole="button" accessibilityState={{ selected: showBefore }} onPress={() => setShowBefore(b => !b)} hitSlop={6}
                    style={{ position: 'absolute', top: 8, right: 8, paddingHorizontal: 12, height: 32, borderRadius: radius.md, backgroundColor: 'rgba(43,49,61,0.7)', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.white }}>{showBefore ? 'After' : 'Before'}</Text>
                  </Pressable>
                )}
              </View>
              {backgrounds && (
                <View style={{ gap: 10 }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>Background</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <Pressable accessibilityRole="button" accessibilityLabel="As taken" accessibilityState={{ selected: backdrop === 'original' }} onPress={() => void chooseBackdrop('original')}
                      style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: backdrop === 'original' ? colors.primary : colors.outline, backgroundColor: colors.inputFill, alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name="image" size={18} color={colors.grey} />
                    </Pressable>
                    {PLAIN_BACKDROPS.map(b => (
                      <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={b.label} accessibilityState={{ selected: backdrop === b.id, disabled: !!making }} disabled={!!making} onPress={() => void chooseBackdrop(b.id)}
                        style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: backdrop === b.id ? colors.primary : colors.outline, backgroundColor: b.colour, alignItems: 'center', justifyContent: 'center' }}>
                        {making === b.id && <ActivityIndicator size="small" color={colors.primary} />}
                      </Pressable>
                    ))}
                  </View>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>
                    AI scenes{backgrounds.scenesLeft !== null && <Text style={{ fontFamily: fonts.regular, color: colors.grey }}> ({backgrounds.scenesLeft} left this month)</Text>}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {SCENE_BACKDROPS.map(b => {
                      const on = backdrop === b.id;
                      const off = !!making || (backgrounds.scenesLeft === 0 && !variants[b.id]);
                      return (
                        <Pressable key={b.id} accessibilityRole="button" accessibilityState={{ selected: on, disabled: off }} disabled={off} onPress={() => void chooseBackdrop(b.id)}
                          style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: radius.full, justifyContent: 'center', borderWidth: 1, borderColor: on ? colors.primary : colors.outline, backgroundColor: on ? `${colors.primary}14` : colors.white, opacity: off && !on ? 0.5 : 1 }}>
                          {making === b.id ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: on ? colors.primary : colors.ink }}>{b.label}</Text>}
                        </Pressable>
                      );
                    })}
                  </View>
                  {making && <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey }}>Making the background… the food stays exactly as it is.</Text>}
                  {error && !making && <Text accessibilityRole="alert" style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.coral }}>{error}</Text>}
                </View>
              )}
            </Card>

            <Card style={{ gap: 12 }}>
              {!result.reading.isFood && (
                <View accessibilityRole="alert" style={{ backgroundColor: `${colors.amber}1A`, borderRadius: radius.md, padding: 12 }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>This does not look like food. Check the caption before you post it.</Text>
                </View>
              )}
              {result.reading.dishName && <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.grey, textTransform: 'uppercase' }}>{result.reading.dishName}</Text>}
              <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>Caption</Text>
              <TextInput
                value={caption} onChangeText={setCaption} multiline accessibilityLabel="Caption"
                style={[{ fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.ink, minHeight: 120, textAlignVertical: 'top', backgroundColor: colors.inputFill, borderRadius: radius.md, padding: 12 }, noOutline]}
              />
              <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>Hashtags <Text style={{ fontFamily: fonts.regular, color: colors.grey }}>(tap to leave one out)</Text></Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {tags.map((t, i) => (
                  <Pressable key={t.tag} accessibilityRole="button" accessibilityState={{ selected: t.on }} onPress={() => setTags(ts => ts.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                    style={{ paddingHorizontal: 10, height: 32, borderRadius: radius.full, justifyContent: 'center', borderWidth: 1, borderColor: t.on ? `${colors.primary}33` : colors.outline, backgroundColor: t.on ? `${colors.primary}14` : colors.white }}>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: t.on ? colors.primary : colors.grey, textDecorationLine: t.on ? 'none' : 'line-through' }}>{t.tag}</Text>
                  </Pressable>
                ))}
              </View>
              {result.orderLine ? (
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: withOrder }} onPress={() => setWithOrder(w => !w)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 }}>
                  <MaterialIcons name={withOrder ? 'check-box' : 'check-box-outline-blank'} size={22} color={colors.primary} />
                  <Text style={{ flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.ink }}>Add “{result.orderLine}”</Text>
                </Pressable>
              ) : (
                <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey }}>Add your phone number in the website’s Settings › Business Profile to tell customers how to order.</Text>
              )}
              <Button label="Share" disabled={!cropped} onPress={() => void share()} icon={<MaterialIcons name="share" size={20} color={colors.white} />} />
              <Button label="Copy caption" variant="soft" onPress={() => void copy()} icon={<MaterialIcons name="content-copy" size={20} color={colors.primary} />} />
              {note && <Text accessibilityRole="text" style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.primary }}>{note}</Text>}
            </Card>

            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <Pressable accessibilityRole="button" disabled={!picked || remaining === 0} onPress={() => picked && void send(picked)} style={{ padding: 8, opacity: !picked || remaining === 0 ? 0.5 : 1 }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.primary }}>Write another caption</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={startAgain} style={{ padding: 8 }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.grey }}>New photo</Text>
              </Pressable>
            </View>
            {remaining !== null && <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey, textAlign: 'center' }}>{remaining} left today. Each new caption uses one.</Text>}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * useVoiceInput.ts
 *
 * Speaking an entry into the capture screen's text box: tap to start, the words appear as they are heard, tap again to stop.
 * Uses the phone's own speech recognition (on Android that is Google's, which sends the audio to Google unless the phone has
 * the language downloaded for offline use). Nothing is read or saved by the server until the owner taps Read it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { VOICE_LANG, applyResult, describeVoiceError, dictatedText, finishDictation, startDictation, type Dictation } from './voice';

export function useVoiceInput(io: { getText: () => string; setText: (text: string) => void; getHints?: () => string[] }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dictation = useRef<Dictation>(startDictation(''));
  const listeningRef = useRef(false);
  const ioRef = useRef(io);
  ioRef.current = io;

  const show = () => ioRef.current.setText(dictatedText(dictation.current));
  const setLive = (on: boolean) => { listeningRef.current = on; setListening(on); };

  useSpeechRecognitionEvent('start', () => setLive(true));
  useSpeechRecognitionEvent('result', event => {
    dictation.current = applyResult(dictation.current, event.results[0]?.transcript ?? '', event.isFinal);
    show();
  });
  useSpeechRecognitionEvent('error', event => { setError(describeVoiceError(event.error)); });
  useSpeechRecognitionEvent('end', () => {
    dictation.current = finishDictation(dictation.current);
    show();
    setLive(false);
  });

  // Leaving the screen stops the microphone.
  useEffect(() => () => { if (listeningRef.current) ExpoSpeechRecognitionModule.abort(); }, []);

  /** Starts listening, or stops it when it is already listening. The words are added after what is already written. */
  const toggle = useCallback(async () => {
    setError(null);
    if (listeningRef.current) { ExpoSpeechRecognitionModule.stop(); return; }
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) { setError(describeVoiceError('service-not-allowed')); return; }
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) { setError(describeVoiceError('not-allowed')); return; }
    dictation.current = startDictation(ioRef.current.getText());
    // The owner's own menu and materials (and customers, if they asked), so what they say is heard as those words.
    const hints = ioRef.current.getHints?.() ?? [];
    ExpoSpeechRecognitionModule.start({ lang: VOICE_LANG, interimResults: true, continuous: true, ...(hints.length > 0 && { contextualStrings: hints }) });
  }, []);

  const stop = useCallback(() => { if (listeningRef.current) ExpoSpeechRecognitionModule.stop(); }, []);

  return { listening, error, toggle, stop };
}

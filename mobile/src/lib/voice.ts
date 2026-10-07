/**
 * voice.ts
 *
 * The plain logic of speaking an entry: how what the phone hears is put together with what is already written, and what to say
 * when listening fails. The recognizer itself (the native library) is in useVoiceInput.ts.
 *
 * The phone's recognizer sends partial results (the sentence so far, replaced by the next partial) and final ones (a finished
 * stretch of speech, after which it starts a new stretch), so a dictation keeps three things: the text that was already there,
 * the stretches that are final, and the partial one in progress.
 */

/** English as spoken in India: it takes Indian names, rupee amounts and the usual kitchen words best. */
export const VOICE_LANG = 'en-IN';

/** The most text one entry holds (the same limit as the text box). */
export const VOICE_TEXT_MAX = 2000;

export interface Dictation { base: string; committed: string; interim: string }

export const startDictation = (base: string): Dictation => ({ base, committed: '', interim: '' });

const join = (...parts: string[]): string => parts.map(p => p.trim()).filter(Boolean).join(' ');

/** A result from the recognizer: a final one is kept and a partial one replaces the last partial. */
export function applyResult(d: Dictation, transcript: string, isFinal: boolean): Dictation {
  const heard = transcript.trim();
  return isFinal ? { ...d, committed: join(d.committed, heard), interim: '' } : { ...d, interim: heard };
}

/** Listening has ended: a partial that never became final is kept rather than lost. */
export const finishDictation = (d: Dictation): Dictation => ({ ...d, committed: join(d.committed, d.interim), interim: '' });

/** What the text box should show: what was written, then what was said. */
export const dictatedText = (d: Dictation, max = VOICE_TEXT_MAX): string => join(d.base, d.committed, d.interim).slice(0, max);

/** What to tell the owner when listening fails, by the recognizer's error code; null when nothing needs saying (they stopped it). */
export function describeVoiceError(code: string | undefined): string | null {
  switch (code) {
    case 'aborted': return null;
    case 'no-speech':
    case 'speech-timeout': return 'I did not hear anything. Tap the mic and try again.';
    case 'not-allowed': return 'Stockpot Quick needs the microphone. Allow it in the phone\'s Settings, under Apps, then Permissions, or type instead.';
    case 'service-not-allowed': return 'Speech recognition is not available on this phone. Check that the Google app is installed and up to date, or type instead.';
    case 'network': return 'Could not reach the speech service. Check your connection, or type instead.';
    case 'audio-capture': return 'Could not use the microphone. Another app may be using it.';
    case 'language-not-supported': return 'This phone cannot recognise English (India) yet. Type instead, or add the language in the Google app\'s voice settings.';
    case 'busy': return 'The speech service is busy. Try again in a moment.';
    default: return 'Could not listen just now. Try again, or type instead.';
  }
}

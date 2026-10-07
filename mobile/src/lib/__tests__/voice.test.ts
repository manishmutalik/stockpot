import { describe, it, expect } from 'vitest';
import { VOICE_TEXT_MAX, applyResult, describeVoiceError, dictatedText, finishDictation, startDictation } from '../voice';

describe('dictation', () => {
  it('shows what is heard so far, each partial replacing the last', () => {
    let d = startDictation('');
    d = applyResult(d, 'Priya', false);
    expect(dictatedText(d)).toBe('Priya');
    d = applyResult(d, 'Priya wants two brownies', false);
    expect(dictatedText(d)).toBe('Priya wants two brownies');
  });

  it('keeps a final stretch and carries on after it, as the phone does on a pause', () => {
    let d = startDictation('');
    d = applyResult(d, 'Priya wants two brownies', true);
    d = applyResult(d, 'for Saturday', false);
    expect(dictatedText(d)).toBe('Priya wants two brownies for Saturday');
    d = applyResult(d, 'for Saturday evening', true);
    expect(dictatedText(d)).toBe('Priya wants two brownies for Saturday evening');
  });

  it('adds to what was already written, with one space between', () => {
    let d = startDictation('Priya wants two brownies');
    d = applyResult(d, 'for Saturday', true);
    expect(dictatedText(d)).toBe('Priya wants two brownies for Saturday');
    expect(dictatedText(applyResult(startDictation('first line\n'), 'second', true))).toBe('first line second');
  });

  it('keeps a partial that never became final when listening ends', () => {
    const heard = applyResult(startDictation('Bought'), 'five kilo maida', false);
    expect(dictatedText(heard)).toBe('Bought five kilo maida');
    expect(dictatedText(finishDictation(heard))).toBe('Bought five kilo maida');
    expect(finishDictation(heard).interim).toBe('');
  });

  it('ignores empty results and never goes past the limit of the text box', () => {
    expect(dictatedText(applyResult(startDictation('abc'), '   ', true))).toBe('abc');
    const long = applyResult(startDictation(''), 'x'.repeat(VOICE_TEXT_MAX + 500), true);
    expect(dictatedText(long)).toHaveLength(VOICE_TEXT_MAX);
  });
});

describe('describeVoiceError', () => {
  it('says nothing when the owner stopped it, and speaks plainly otherwise', () => {
    expect(describeVoiceError('aborted')).toBeNull();
    expect(describeVoiceError('no-speech')).toMatch(/did not hear/);
    expect(describeVoiceError('speech-timeout')).toMatch(/did not hear/);
    expect(describeVoiceError('not-allowed')).toMatch(/microphone/);
    expect(describeVoiceError('service-not-allowed')).toMatch(/not available on this phone/);
    expect(describeVoiceError('network')).toMatch(/connection/);
    expect(describeVoiceError('audio-capture')).toMatch(/Another app/);
    expect(describeVoiceError('language-not-supported')).toMatch(/English \(India\)/);
    expect(describeVoiceError('busy')).toMatch(/busy/);
    expect(describeVoiceError('something-new')).toMatch(/Try again, or type instead/);
    expect(describeVoiceError(undefined)).toMatch(/Try again/);
  });
});

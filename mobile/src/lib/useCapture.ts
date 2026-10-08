/**
 * useCapture.ts
 *
 * Runs one entry (see capture.ts) against the server: reads the words, answers the questions, saves, and keeps the unsaved
 * entry on the device. The screens only show the state and call these.
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import type { ParseResponse, QuickKind } from '../../../src/utils/quickApiTypes';
import { ApiError, describeApiError, type Api } from './api';
import { canSave, captureReducer, initialCapture, parseBody, saveRequest, type CaptureState } from './capture';
import { createDraftStore } from './draftStore';
import { summarizeSaved } from './savedSummary';

export const draftStore = createDraftStore(AsyncStorage);

/** What to tell the owner when a save fails. A lost connection keeps the entry and says so. */
function saveMessage(err: unknown): string {
  if (err instanceof ApiError && (err.status === 0)) return 'No connection — your draft is kept. Try again when you are back online.';
  return describeApiError(err);
}

export function useCapture(api: Api, input: { kind: QuickKind | null; resume: boolean; text?: string }) {
  const [state, dispatch] = useReducer(captureReducer, undefined, () => initialCapture({ kind: input.kind, text: input.text, idempotencyKey: randomUUID() }));
  const latest = useRef<CaptureState>(state);
  latest.current = state;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  /** Asks the server to read the words: fresh (a new reading, one use) or with the answers so far (free). */
  const runParse = useCallback(async (from: CaptureState, fresh: boolean) => {
    dispatch({ type: 'readStarted', fresh });
    try {
      const response = await api.post<ParseResponse>('/api/mobile/parse', parseBody(from, { fresh }));
      if (alive.current) dispatch({ type: 'readFinished', response, idempotencyKey: randomUUID() });
    } catch (err) {
      if (alive.current) dispatch({ type: 'readFailed', message: describeApiError(err) });
    }
  }, [api]);

  const setText = useCallback((text: string) => dispatch({ type: 'textChanged', text }), []);
  const read = useCallback(() => runParse(latest.current, true), [runParse]);

  const answer = useCallback((questionId: string, value: string) => {
    const s = latest.current;
    const answers = [...s.answers.filter(a => a.questionId !== questionId), { questionId, value }];
    dispatch({ type: 'answered', questionId, value });
    return runParse({ ...s, answers }, false);
  }, [runParse]);

  const save = useCallback(async () => {
    const s = latest.current;
    if (!canSave(s) || !s.response) return;
    const request = saveRequest(s.response);
    if (!request || !s.response.kind) return;
    dispatch({ type: 'saveStarted' });
    try {
      const saved = await api.post<unknown>(request.path, request.body, { idempotencyKey: s.idempotencyKey });
      await draftStore.clear();
      if (alive.current) dispatch({ type: 'saveFinished', summary: summarizeSaved(s.response.kind, saved, s.response) });
    } catch (err) {
      if (alive.current) dispatch({ type: 'saveFailed', message: saveMessage(err) });
    }
  }, [api]);

  // Keep the unsaved entry on the device while there is one; drop it when it is saved.
  useEffect(() => {
    if (state.step === 'saved') { draftStore.clear(); return; }
    if (state.step === 'saving' || state.step === 'reading' || state.text.trim() === '') return;
    const timer = setTimeout(() => {
      draftStore.save({ text: state.text, kind: state.kind, reading: state.reading, answers: state.answers, idempotencyKey: state.idempotencyKey });
    }, 400);
    return () => clearTimeout(timer);
  }, [state.step, state.text, state.kind, state.reading, state.answers, state.idempotencyKey]);

  // Pick an unsaved entry up again: the words come back, and if it had been read, the draft is put back for free.
  useEffect(() => {
    if (!input.resume) return;
    let cancelled = false;
    (async () => {
      const kept = await draftStore.load();
      if (!kept || cancelled) return;
      dispatch({ type: 'restored', text: kept.text, kind: kept.kind, reading: kept.reading, answers: kept.answers, idempotencyKey: kept.idempotencyKey });
      if (kept.reading !== undefined) {
        await runParse({ ...initialCapture({ kind: kept.kind, text: kept.text, idempotencyKey: kept.idempotencyKey }), reading: kept.reading, answers: kept.answers }, false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const discard = useCallback(async () => { await draftStore.clear(); }, []);

  return { state, setText, read, answer, save, edit: () => dispatch({ type: 'edit' }), acceptShortage: () => dispatch({ type: 'acceptShortage' }), discard };
}

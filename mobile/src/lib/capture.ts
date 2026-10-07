/**
 * capture.ts
 *
 * The state of one "tell Stockpot what happened" from the first word to the saved summary, as a plain reducer with no React
 * Native in it, so every turn of it is tested: write (or say) it, read it, ask what is unclear one question at a time,
 * confirm, save.
 *
 * Rules it keeps:
 *  - Reading the text again from the start (Read it) throws away the earlier reading and answers: it is a fresh read.
 *    Answering a question sends the earlier reading back with the answers, so it costs nothing and cannot change what was said.
 *  - Every new draft gets a new idempotency key; a retry of the same Save keeps its key, so a flaky connection can never
 *    save an order twice, and an edited draft can never be mistaken for the one already saved.
 *  - The app shows what the server worked out and never works out money itself.
 */
import type { Answer, ParseResponse, Question, QuickKind } from '../../../src/utils/quickApiTypes';
import type { SavedSummary } from './savedSummary';

export type Step = 'write' | 'reading' | 'ask' | 'confirm' | 'saving' | 'saved';

export interface CaptureState {
  step: Step;
  text: string;
  /** What the owner asked for (a shortcut chip), or null to let the server work it out from the words. */
  kind: QuickKind | null;
  /** The server's last answer: a draft, its figures and what is still open. */
  response: ParseResponse | null;
  /** The model's checked reading from the last fresh read, sent back with the answers. */
  reading: unknown;
  answers: Answer[];
  error: string | null;
  /** Where a failed read goes back to: the question being answered, or the text. */
  returnTo: 'write' | 'ask';
  idempotencyKey: string;
  /** The owner has seen that an ingredient would run short and chosen to log the run anyway. */
  shortageAccepted: boolean;
  saved: SavedSummary | null;
}

export type CaptureAction =
  | { type: 'textChanged'; text: string }
  /** `fresh`: Read it (a new reading). Not fresh: answering, which reuses the reading. */
  | { type: 'readStarted'; fresh: boolean }
  | { type: 'readFinished'; response: ParseResponse; idempotencyKey: string }
  | { type: 'readFailed'; message: string }
  | { type: 'answered'; questionId: string; value: string }
  | { type: 'restored'; text: string; kind: QuickKind | null; reading: unknown; answers: Answer[]; idempotencyKey: string }
  | { type: 'edit' }
  | { type: 'acceptShortage' }
  | { type: 'saveStarted' }
  | { type: 'saveFailed'; message: string }
  | { type: 'saveFinished'; summary: SavedSummary };

export function initialCapture(input: { kind: QuickKind | null; text?: string; idempotencyKey: string }): CaptureState {
  return {
    step: 'write', text: input.text ?? '', kind: input.kind, response: null, reading: undefined, answers: [],
    error: null, returnTo: 'write', idempotencyKey: input.idempotencyKey, shortageAccepted: false, saved: null,
  };
}

/** What to tell the owner when the server read the message but could not make a draft of it. */
export const COULD_NOT_READ = 'I could not read that. Try saying it again, with the quantities and names.';

export function captureReducer(state: CaptureState, action: CaptureAction): CaptureState {
  switch (action.type) {
    case 'textChanged':
      return { ...state, text: action.text, response: null, reading: undefined, answers: [], error: null, step: 'write', shortageAccepted: false };

    case 'readStarted':
      return {
        ...state, step: 'reading', error: null,
        returnTo: !action.fresh && (state.response?.questions.length ?? 0) > 0 ? 'ask' : 'write',
        ...(action.fresh && { reading: undefined, answers: [], response: null }),
      };

    case 'readFinished': {
      const { response } = action;
      const base = { ...state, response, idempotencyKey: action.idempotencyKey, shortageAccepted: false, reading: response.reading !== undefined ? response.reading : state.reading };
      if (response.questions.length > 0) return { ...base, step: 'ask', error: null };
      if (response.draft !== null) return { ...base, step: 'confirm', error: null };
      // Nothing to confirm and nothing to ask: say why, and let the owner try again.
      return { ...base, step: 'write', reading: undefined, answers: [], response: null, error: response.error ?? COULD_NOT_READ };
    }

    case 'readFailed':
      return { ...state, step: state.returnTo, error: action.message };

    case 'answered':
      return { ...state, answers: [...state.answers.filter(a => a.questionId !== action.questionId), { questionId: action.questionId, value: action.value }] };

    // An unsaved entry picked up again. It goes back to the words; if it had a reading, the caller reads it again with the
    // answers, which is free, to put the draft back on screen.
    case 'restored':
      return { ...initialCapture({ kind: action.kind, text: action.text, idempotencyKey: action.idempotencyKey }), reading: action.reading, answers: action.answers };

    case 'edit':
      return { ...state, step: 'write', error: null };

    case 'acceptShortage':
      return { ...state, shortageAccepted: true };

    case 'saveStarted':
      return { ...state, step: 'saving', error: null };

    case 'saveFailed':
      return { ...state, step: 'confirm', error: action.message };

    case 'saveFinished':
      return { ...state, step: 'saved', saved: action.summary, error: null };
  }
}

/** The body of POST /api/mobile/parse for the current state. */
export function parseBody(state: Pick<CaptureState, 'text' | 'kind' | 'reading' | 'answers'>, opts: { fresh: boolean }): Record<string, unknown> {
  return {
    text: state.text.trim(),
    ...(state.kind && { kind: state.kind }),
    ...(!opts.fresh && state.reading !== undefined && { reading: state.reading }),
    ...(!opts.fresh && state.answers.length > 0 && { answers: state.answers }),
  };
}

/** The question being asked now: the first open one. */
export const currentQuestion = (state: CaptureState): Question | null => state.response?.questions[0] ?? null;

/** "Question 1 of 2": those already answered plus those still open. */
export function questionProgress(state: CaptureState): { number: number; of: number } {
  const open = state.response?.questions.length ?? 0;
  return { number: state.answers.length + 1, of: state.answers.length + open };
}

/** Whether Save may be tapped: a complete draft, and an ingredient shortfall (if any) acknowledged. */
export function canSave(state: CaptureState): boolean {
  const r = state.response;
  if (!r || r.questions.length > 0 || r.draft === null || state.step === 'saving') return false;
  if (r.kind === 'production' && (r.preview?.shortages.length ?? 0) > 0 && !state.shortageAccepted) return false;
  return true;
}

/** The save endpoint and body for a confirmed draft. */
export function saveRequest(response: ParseResponse): { path: string; body: unknown } | null {
  if (response.draft === null) return null;
  switch (response.kind) {
    case 'order': return { path: '/api/mobile/orders', body: response.draft };
    case 'restock': return { path: '/api/mobile/restocks', body: response.draft };
    case 'production': return { path: '/api/mobile/production-runs', body: response.draft };
    case 'payment': {
      const { customerKey, amount, method } = response.draft;
      return customerKey && amount !== undefined && method ? { path: '/api/mobile/payments', body: { customerKey, amount, method } } : null;
    }
    default: return null;
  }
}

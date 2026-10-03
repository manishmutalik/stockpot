/**
 * chatRoutes.ts
 *
 * POST /api/ai/chat: "Ask your business", with its dependencies injected so it
 * is tested without Firebase or the model. Wired up in server.ts behind
 * requireAuth and requireCsrf.
 *
 * In order: check the request, check the account may use AI (this counts
 * nothing), count one use against the daily caps, ask the model, and validate
 * what it wrote. The model is asked again once if its answer fails validation;
 * if that fails too nothing is shown (`answer: null`), because an unchecked
 * answer must never reach the owner. A question that was counted stays counted.
 */
import type { Response } from 'express';
import { CHAT_MAX_ANSWER_CHARS, CHAT_MAX_HISTORY_TURNS, CHAT_MAX_QUESTION_CHARS, validateChatAnswer, type ChatTurn } from '../src/utils/aiChat';
import type { AiSnapshot } from '../src/utils/aiSnapshot';
import type { AuthedRequest } from './auth';
import { aiErrorResponse } from './anthropic';
import { checkAiEntitlement, reserveAiFeature, type AiGuardDeps } from './aiGuard';
import type { ChatModel } from './chatModel';
import { validateSnapshotShape } from './briefingRoutes';

export interface ChatDeps extends Pick<AiGuardDeps, 'config' | 'billingDisabled' | 'hasActiveAccess' | 'usageDay' | 'globalDay' | 'reserve'> {
  model: ChatModel;
}

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The request body: a question, the snapshot it is about and a few earlier turns, each bounded in size. */
export function parseChatRequest(body: unknown): { question: string; snapshot: AiSnapshot; history: ChatTurn[] } | null {
  if (!isObject(body)) return null;
  const { question, snapshot, history } = body;
  if (typeof question !== 'string' || question.trim() === '' || question.length > CHAT_MAX_QUESTION_CHARS) return null;
  if (!validateSnapshotShape(snapshot)) return null;
  if (history !== undefined) {
    if (!Array.isArray(history) || history.length > CHAT_MAX_HISTORY_TURNS) return null;
    for (const t of history) {
      if (!isObject(t) || typeof t.question !== 'string' || typeof t.answer !== 'string') return null;
      if (t.question.length > CHAT_MAX_QUESTION_CHARS || t.answer.length > CHAT_MAX_ANSWER_CHARS) return null;
    }
  }
  return { question: question.trim(), snapshot: snapshot as AiSnapshot, history: (history ?? []) as ChatTurn[] };
}

/** The model's answer, validated; asked a second time with what was wrong if the first fails. Null if neither passes. */
export async function answerValidated(
  input: { snapshot: AiSnapshot; question: string; history: ChatTurn[] },
  model: ChatModel
): Promise<string | null> {
  let problems: string[] | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { raw } = await model({ ...input, problems });
    if (raw === undefined) { problems = ['the answer was not valid JSON in the required format']; continue; }
    const checked = validateChatAnswer(raw, input.snapshot);
    if (checked.ok === true) return checked.answer;
    problems = checked.problems;
  }
  return null;
}

export function createChatHandler(deps: ChatDeps) {
  return async (req: AuthedRequest, res: Response) => {
    const uid = req.uid!;
    const who = { uid, email: req.email, emailVerified: req.emailVerified };
    try {
      const parsed = parseChatRequest(req.body);
      if (!parsed) return res.status(400).json({ error: 'The request was not understood.', code: 'bad_request' });

      const entitled = await checkAiEntitlement(who, deps);
      if (entitled.ok === false) return res.status(entitled.status).json({ error: entitled.message, code: entitled.code });

      const access = await reserveAiFeature(who, 'chat', deps);
      if (access.ok === false) return res.status(access.status).json({ error: access.message, code: access.code });
      const remaining = Math.max(access.limit - access.used, 0);

      try {
        const answer = await answerValidated(parsed, deps.model);
        if (answer === null) {
          return res.json({ answer: null, code: 'unverified', error: 'I could not give a checked answer to that. Try asking it a different way.', remaining });
        }
        return res.json({ answer, remaining });
      } catch (err: any) {
        console.error('Chat failed:', err?.message);
        const mapped = aiErrorResponse(err);
        return res.status(mapped.status).json({ error: mapped.message, code: 'model_error' });
      }
    } catch (err: any) {
      console.error('Chat request failed:', err?.message);
      return res.status(500).json({ error: 'Could not answer that.' });
    }
  };
}

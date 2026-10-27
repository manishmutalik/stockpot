/**
 * geminiImage.ts
 *
 * The one place the server calls Google's Gemini (GEMINI_API_KEY, kept on the server only): an image edit, for Promote's
 * Styled photo. A plain REST call (POST …/v1beta/models/{model}:generateContent, `x-goog-api-key`), with the photo as
 * inline data and the instructions as text, asking for an image back at an aspect ratio.
 *
 * Gemini's error text is logged (it holds no personal data) so a failing call can be diagnosed from the server's logs;
 * the owner is told only that the photo could not be styled. A photo the model declines (its safety filters) comes back
 * as `declined`, which the owner is told plainly.
 */

export class GeminiImageError extends Error {
  constructor(public status: number, public reason: 'declined' | 'failed', message: string) {
    super(message);
    this.name = 'GeminiImageError';
  }
}

export interface GeminiImage {
  /** The edited image's bytes and type. */
  edit(input: { photo: Buffer; prompt: string; aspectRatio: string }): Promise<{ data: Buffer; mimeType: string }>;
}

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
export const GEMINI_IMAGE_TIMEOUT_MS = 90_000;

interface Part { text?: string; inlineData?: { mimeType?: string; data?: string } }
interface GenerateResponse {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: Record<string, number>;
}

export function createGeminiImage(input: { apiKey: () => string | undefined; model: () => string; fetchImpl?: typeof fetch; timeoutMs?: number }): GeminiImage {
  return {
    async edit({ photo, prompt, aspectRatio }) {
      const key = input.apiKey()?.trim();
      if (!key) throw new GeminiImageError(0, 'failed', 'GEMINI_API_KEY is not set');
      const model = input.model();
      let res: Response;
      try {
        res = await (input.fetchImpl ?? fetch)(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: photo.toString('base64') } }, { text: prompt }] }],
            generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio } },
          }),
          signal: AbortSignal.timeout(input.timeoutMs ?? GEMINI_IMAGE_TIMEOUT_MS),
        });
      } catch (err: unknown) {
        throw new GeminiImageError(0, 'failed', (err as Error)?.name === 'TimeoutError' ? 'timed out' : String((err as Error)?.message));
      }
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 400);
        console.error('[gemini] image edit failed', { model, status: res.status, detail });
        throw new GeminiImageError(res.status, 'failed', `Gemini answered ${res.status}`);
      }
      const body = (await res.json()) as GenerateResponse;
      const candidate = body.candidates?.[0];
      const image = candidate?.content?.parts?.find(p => p.inlineData?.data)?.inlineData;
      console.log('[gemini] image edit', { model, finish: candidate?.finishReason, blocked: body.promptFeedback?.blockReason, usage: body.usageMetadata, image: !!image });
      if (!image?.data) {
        const declined = !!body.promptFeedback?.blockReason || /SAFETY|PROHIBITED|BLOCKLIST|RECITATION/.test(candidate?.finishReason ?? '');
        throw new GeminiImageError(200, declined ? 'declined' : 'failed', `no image (${body.promptFeedback?.blockReason ?? candidate?.finishReason ?? 'none'})`);
      }
      return { data: Buffer.from(image.data, 'base64'), mimeType: image.mimeType ?? 'image/png' };
    },
  };
}

/** What the owner is told when Gemini fails: never its own text. */
export function geminiErrorMessage(err: unknown): { status: number; message: string; code: string } {
  if (err instanceof GeminiImageError && err.reason === 'declined') {
    return { status: 422, code: 'style_declined', message: 'This photo could not be styled. Try another style, or another photo.' };
  }
  if (err instanceof GeminiImageError && (err.status === 429 || err.status === 503)) {
    return { status: 503, code: 'style_busy', message: 'Styling is very busy right now. Please try again in a minute.' };
  }
  return { status: 502, code: 'style_failed', message: 'That photo could not be styled. Please try again.' };
}

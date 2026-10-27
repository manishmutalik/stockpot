/**
 * photoroom.ts
 *
 * The one place the server calls Photoroom (PHOTOROOM_API_KEY, kept on the server only), for Promote's backgrounds:
 *  - `cutout`: POST https://sdk.photoroom.com/v1/segment, the photo with its background removed (PNG with transparency).
 *    The server keeps only its transparency, as the mask of where the food is.
 *  - `scene`: POST https://image-api.photoroom.com/v2/edit with `background.prompt`, a new background painted around the
 *    subject, the same size as the photo and with the subject in the same place (`outputSize` and `referenceBox`
 *    `originalImage`), so the original food can be laid back on top exactly (lib/promoteBackground).
 *
 * A sandbox key (`sandbox_…`) works the same and is free; its images carry Photoroom's watermark. Photoroom's error
 * text is logged (it holds no personal data) so a failing call can be diagnosed from the server's logs; the owner is
 * told only that the background could not be made.
 */

export class PhotoroomError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'PhotoroomError';
  }
}

export interface Photoroom {
  cutout(photo: Buffer): Promise<Buffer>;
  scene(photo: Buffer, prompt: string): Promise<Buffer>;
}

export const PHOTOROOM_SEGMENT_URL = 'https://sdk.photoroom.com/v1/segment';
export const PHOTOROOM_EDIT_URL = 'https://image-api.photoroom.com/v2/edit';
export const PHOTOROOM_TIMEOUT_MS = 60_000;

export function createPhotoroom(input: { apiKey: () => string | undefined; fetchImpl?: typeof fetch; timeoutMs?: number }): Photoroom {
  const call = async (url: string, form: FormData, what: string): Promise<Buffer> => {
    const key = input.apiKey()?.trim();
    if (!key) throw new PhotoroomError(0, 'PHOTOROOM_API_KEY is not set');
    let res: Response;
    try {
      res = await (input.fetchImpl ?? fetch)(url, {
        method: 'POST', headers: { 'x-api-key': key, Accept: 'image/png, image/jpeg' }, body: form,
        signal: AbortSignal.timeout(input.timeoutMs ?? PHOTOROOM_TIMEOUT_MS),
      });
    } catch (err: unknown) {
      throw new PhotoroomError(0, `${what}: ${(err as Error)?.name === 'TimeoutError' ? 'timed out' : (err as Error)?.message}`);
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      console.error(`[photoroom] ${what} failed`, { status: res.status, detail });
      throw new PhotoroomError(res.status, `${what}: Photoroom answered ${res.status}`);
    }
    console.log(`[photoroom] ${what}`, { status: res.status, sandbox: key.startsWith('sandbox_') });
    return Buffer.from(await res.arrayBuffer());
  };
  const file = (photo: Buffer) => new Blob([new Uint8Array(photo)], { type: 'image/jpeg' });

  return {
    cutout: photo => {
      const form = new FormData();
      form.append('image_file', file(photo), 'photo.jpg');
      form.append('format', 'png');
      return call(PHOTOROOM_SEGMENT_URL, form, 'cutout');
    },
    scene: (photo, prompt) => {
      const form = new FormData();
      form.append('imageFile', file(photo), 'photo.jpg');
      form.append('background.prompt', prompt);
      form.append('outputSize', 'originalImage');
      form.append('referenceBox', 'originalImage');
      form.append('shadow.mode', 'ai.soft');
      form.append('export.format', 'jpeg');
      return call(PHOTOROOM_EDIT_URL, form, 'scene');
    },
  };
}

/** What the owner is told when Photoroom fails: never its own text. */
export function photoroomErrorMessage(err: unknown): { status: number; message: string } {
  const status = err instanceof PhotoroomError ? err.status : 0;
  if (status === 402 || status === 429) return { status: 503, message: 'Backgrounds are very busy right now. Please try again later.' };
  return { status: 502, message: 'That background could not be made. Please try again.' };
}

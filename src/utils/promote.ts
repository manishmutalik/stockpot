/**
 * promote.ts
 *
 * Promote: a photo of a dish, made ready for Instagram, with a caption and hashtags. Shared by the server (to check what
 * the model wrote), the website and the phone app (to crop the photo to a post or a story and build the text to share).
 *
 *  - The photo itself is improved by code on the server (lib/promoteImage), never redrawn by the model: the food in the
 *    picture is the food the customer gets.
 *  - The model only looks at the photo and writes: which dish it is (an id from the menu that was sent, or none), where the
 *    food sits in the frame (so a crop keeps it), a caption and hashtags. How to order (the WhatsApp number) is added by
 *    code, so a number is never made up and never sent to the model.
 *  - Nothing is kept: the photo is read, improved and sent back.
 */

/** What this section is called wherever the owner sees it (website, phone app, Help). Change it here to rename it. */
export const PROMOTE_LABEL = 'Promote';

/** The longest side a photo is shrunk to before it is sent: plenty for a 1080 px wide post, small enough to send on a phone. */
export const PROMOTE_PHOTO_MAX_SIDE = 2048;
/** The longest side of the copy the model looks at: enough to recognise a dish, and cheaper to read. */
export const PROMOTE_MODEL_SIDE = 1024;
export const PROMOTE_MAX_MENU = 300;
export const PROMOTE_CAPTION_MAX = 600;
export const PROMOTE_MIN_HASHTAGS = 3;
export const PROMOTE_MAX_HASHTAGS = 15;

export type PromoteLanguage = 'en' | 'hinglish';
export const PROMOTE_LANGUAGES: { value: PromoteLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'hinglish', label: 'Hinglish' },
];

export type PromoteShapeId = 'post' | 'square' | 'story';
export interface PromoteShape { id: PromoteShapeId; label: string; hint: string; width: number; height: number }
/** Instagram's sizes: a portrait post (what the feed shows largest), a square post, and a story (also WhatsApp Status). */
export const PROMOTE_SHAPES: PromoteShape[] = [
  { id: 'post', label: 'Post', hint: '4:5', width: 1080, height: 1350 },
  { id: 'square', label: 'Square', hint: '1:1', width: 1080, height: 1080 },
  { id: 'story', label: 'Story', hint: '9:16', width: 1080, height: 1920 },
];
export const shapeOf = (id: PromoteShapeId): PromoteShape => PROMOTE_SHAPES.find(s => s.id === id) ?? PROMOTE_SHAPES[0];

/** A point in the photo as fractions of its width and height (0,0 top left). */
export interface Focus { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }

/**
 * The largest part of a `width` × `height` photo in the shape's proportions, centred on `focus` as far as the edges allow,
 * in whole pixels.
 */
export function cropRect(width: number, height: number, shape: Pick<PromoteShape, 'width' | 'height'>, focus: Focus = { x: 0.5, y: 0.5 }): Rect {
  const ratio = shape.width / shape.height;
  let w = width, h = Math.round(width / ratio);
  if (h > height) { h = height; w = Math.round(height * ratio); }
  w = Math.min(w, width); h = Math.min(h, height);
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  const fx = Number.isFinite(focus.x) ? clamp(focus.x, 1) : 0.5;
  const fy = Number.isFinite(focus.y) ? clamp(focus.y, 1) : 0.5;
  return { x: Math.round(clamp(fx * width - w / 2, width - w)), y: Math.round(clamp(fy * height - h / 2, height - h)), width: w, height: h };
}

/** The line telling customers how to order, from the business's phone number; null without one. */
export function orderLine(phone: string | null | undefined): string | null {
  const number = (phone ?? '').trim();
  return number.replace(/\D/g, '').length >= 8 ? `Order on WhatsApp: ${number}` : null;
}

/** The text to post: the caption, how to order, then the hashtags that are still chosen. */
export function postText(caption: string, hashtags: string[], order: string | null): string {
  return [caption.trim(), order, hashtags.length ? hashtags.join(' ') : null].filter((p): p is string => !!p && p !== '').join('\n\n');
}

// ── What the model writes ─────────────────────────────────────────────────────

export interface PromoteReading {
  /** False when the photo is not of food or drink (a caption is still written, and the owner is told). */
  isFood: boolean;
  /** The menu item it shows, from the ids that were sent; null when it is none of them. */
  menuItemId: string | null;
  /** What the dish is called: the menu item's name when it is one. */
  dishName: string | null;
  focus: Focus;
  caption: string;
  /** Each with its #, unique, at most PROMOTE_MAX_HASHTAGS. */
  hashtags: string[];
}

/** The JSON schema the model's answer must follow (structured outputs). */
export const PROMOTE_SCHEMA = {
  type: 'object',
  properties: {
    isFood: { type: 'boolean' },
    menuItemId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    dishName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    focusX: { type: 'number' },
    focusY: { type: 'number' },
    caption: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
  },
  required: ['isFood', 'menuItemId', 'dishName', 'focusX', 'focusY', 'caption', 'hashtags'],
  additionalProperties: false,
} as const;

const HASHTAG = /^#[\p{L}\p{M}\p{N}_]{2,40}$/u;

/** A hashtag as Instagram takes it: one #, then letters, digits and underscores only. Null when nothing usable is left. */
export function cleanHashtag(raw: string): string | null {
  const body = raw.trim().replace(/^#+/, '').replace(/[^\p{L}\p{M}\p{N}_]/gu, '');
  const tag = `#${body}`;
  return HASHTAG.test(tag) ? tag : null;
}

export type PromoteValidation = { ok: true; reading: PromoteReading } | { ok: false; problems: string[] };

/** Checks the model's answer against the menu ids that were sent, and tidies the hashtags. */
export function validatePromoteReading(raw: unknown, input: { menuIds: Iterable<string> }): PromoteValidation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, problems: ['the answer is not an object'] };
  const r = raw as Record<string, unknown>;
  const problems: string[] = [];
  const ids = new Set(input.menuIds);
  if (typeof r.isFood !== 'boolean') problems.push('isFood must be true or false');
  const menuItemId = r.menuItemId === null || r.menuItemId === undefined || r.menuItemId === '' ? null : r.menuItemId;
  if (menuItemId !== null && (typeof menuItemId !== 'string' || !ids.has(menuItemId))) problems.push('menuItemId must be one of the menu ids given, or null');
  const fx = Number(r.focusX), fy = Number(r.focusY);
  if (!Number.isFinite(fx) || fx < 0 || fx > 1 || !Number.isFinite(fy) || fy < 0 || fy > 1) problems.push('focusX and focusY must be between 0 and 1');
  const caption = typeof r.caption === 'string' ? r.caption.trim() : '';
  if (caption === '') problems.push('the caption is empty');
  if (caption.length > PROMOTE_CAPTION_MAX) problems.push(`the caption is longer than ${PROMOTE_CAPTION_MAX} characters`);
  if (/#[\p{L}\p{M}\p{N}_]/u.test(caption)) problems.push('the caption must not contain hashtags; put them in hashtags');
  if (/(\+?\d[\d\s-]{7,}\d)/.test(caption)) problems.push('the caption must not contain a phone number');
  const tags: string[] = [];
  for (const t of Array.isArray(r.hashtags) ? r.hashtags : []) {
    const tag = typeof t === 'string' ? cleanHashtag(t) : null;
    if (tag && !tags.some(x => x.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  }
  if (tags.length < PROMOTE_MIN_HASHTAGS) problems.push(`give at least ${PROMOTE_MIN_HASHTAGS} hashtags`);
  if (problems.length) return { ok: false, problems };
  const dishName = typeof r.dishName === 'string' && r.dishName.trim() !== '' ? r.dishName.trim().slice(0, 80) : null;
  return {
    ok: true,
    reading: { isFood: r.isFood as boolean, menuItemId: menuItemId as string | null, dishName, focus: { x: fx, y: fy }, caption, hashtags: tags.slice(0, PROMOTE_MAX_HASHTAGS) },
  };
}

// ── The request and the answer (POST /api/ai/promote and /api/mobile/promote) ─────────────────────────────────

/** What the server answers: the improved photo (whole, not cropped: the app crops it to the shape chosen) and the text. */
export interface PromoteResult {
  /** The improved photo, JPEG, base64. */
  image: string;
  width: number;
  height: number;
  reading: PromoteReading;
  /** "Order on WhatsApp: …" from the business's phone number, or null. */
  orderLine: string | null;
  /** Photos that can still be promoted today. */
  remaining?: number;
}

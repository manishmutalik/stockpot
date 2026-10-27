/**
 * promoteBackdrops.ts
 *
 * Promote's backgrounds, shared by the server (which makes them) and the website and phone app (which offer them).
 *
 *  - Plain backdrops are drawn by the server's own code: a soft gradient of one colour with a gentle shadow under the
 *    food. They need only the food cut out of the photo (one Photoroom cut-out, counted against `cutout`).
 *  - AI scenes are painted by Photoroom from a description (a wooden table in window light, a festive table): dearer,
 *    so they have a monthly allowance (`scene`).
 *
 * Either way the food itself is the photo's own pixels, put back on top of the new background by the server: the
 * background changes, the food never does. The cut-out (a mask) is sent back to the app and reused for every other
 * background of the same photo, so it is made once per photo.
 */

export interface PlainBackdrop { id: string; label: string; kind: 'plain'; colour: string }
export interface SceneBackdrop { id: string; label: string; kind: 'scene'; prompt: string }
export type Backdrop = PlainBackdrop | SceneBackdrop;

export const PLAIN_BACKDROPS: PlainBackdrop[] = [
  { id: 'white', label: 'White', kind: 'plain', colour: '#F4F2EE' },
  { id: 'cream', label: 'Cream', kind: 'plain', colour: '#F1E4CC' },
  { id: 'blush', label: 'Blush', kind: 'plain', colour: '#F2D6D0' },
  { id: 'sage', label: 'Sage', kind: 'plain', colour: '#D5E0CC' },
  { id: 'sky', label: 'Sky', kind: 'plain', colour: '#D3E2EF' },
  { id: 'charcoal', label: 'Charcoal', kind: 'plain', colour: '#2F2C2A' },
];

/** Each prompt describes only the setting: Photoroom keeps the food, and the server puts the original back on top anyway. */
export const SCENE_BACKDROPS: SceneBackdrop[] = [
  { id: 'wood', label: 'Wooden table', kind: 'scene', prompt: 'On a rustic wooden table, soft natural window light from the side, shallow depth of field, professional food photography' },
  { id: 'marble', label: 'Marble', kind: 'scene', prompt: 'On a white marble kitchen counter, bright soft daylight, clean and minimal, professional food photography' },
  { id: 'cafe', label: 'Café', kind: 'scene', prompt: 'On a small café table by a window, warm morning light, softly blurred café in the background' },
  { id: 'festive', label: 'Festive', kind: 'scene', prompt: 'On a table with small lit diyas, marigold flowers and warm fairy lights softly blurred behind, festive Indian celebration' },
  { id: 'leaf', label: 'Banana leaf', kind: 'scene', prompt: 'On a dark wooden table with a fresh green banana leaf beneath, South Indian style, soft warm light' },
  { id: 'garden', label: 'Outdoors', kind: 'scene', prompt: 'On a checked picnic cloth outdoors in a garden, soft afternoon sunlight, greenery blurred behind' },
];

export const BACKDROPS: Backdrop[] = [...PLAIN_BACKDROPS, ...SCENE_BACKDROPS];
export const backdropOf = (id: unknown): Backdrop | null => BACKDROPS.find(b => b.id === id) ?? null;

/** What the server answers for POST /api/ai/promote/background and /api/mobile/promote/background. */
export interface BackgroundResult {
  /** The photo on its new background, JPEG, base64, the same size as the photo sent. */
  image: string;
  width: number;
  height: number;
  /** The cut-out (PNG, base64, white where the food is), when one was made for this request: send it with the next one. */
  mask?: string;
  /** AI scenes that can still be made (the smaller of today's and this month's), when a scene was made. */
  scenesLeft?: number;
}

/**
 * promoteStyles.ts
 *
 * Promote's Styled photo: the improved photo restyled by an image model (Google's Gemini, lib/geminiImage) into a
 * professional food photograph: a new setting around the plate, better light, the food touched up. Shared by the server
 * (which sends the style's description) and the website and phone app (which offer the styles).
 *
 * The rule the owner set: the food may be touched up (light, colour, sheen, sharpness) but nothing physical changes: the
 * same items, the same amount, the same shapes and arrangement, the same plate; nothing added (no garnish), nothing
 * removed. lib/promoteStylePrompt says so to the model; the owner is still asked to check the photo before posting.
 */
import type { PromoteShapeId } from './promote';

export interface PromoteStyle { id: string; label: string; scene: string }

/** Each describes only what is around the plate and the light. */
export const PROMOTE_STYLES: PromoteStyle[] = [
  { id: 'rustic', label: 'Rustic table', scene: 'a weathered wooden table with a soft linen napkin beside the plate, warm late-afternoon window light from one side with gentle shadows' },
  { id: 'bright', label: 'Bright & clean', scene: 'a white marble surface, bright soft daylight, airy and minimal, very little else in the frame' },
  { id: 'cafe', label: 'Café', scene: 'a small café table by a window, warm morning light, the café softly out of focus behind' },
  { id: 'festive', label: 'Festive', scene: 'a table with a few small lit diyas and marigold flowers around the plate, warm fairy lights softly blurred behind, an Indian festive mood' },
  { id: 'moody', label: 'Dark & moody', scene: 'a dark slate surface, one soft directional light from the side, deep shadows, a restaurant-menu look' },
  { id: 'outdoor', label: 'Outdoors', scene: 'a garden table outdoors, soft dappled sunlight, greenery softly blurred behind' },
];

export const styleOf = (id: unknown): PromoteStyle | null => PROMOTE_STYLES.find(s => s.id === id) ?? null;

/**
 * The aspect ratio asked of the model for each shape. The model offers 3:4 rather than Instagram's 4:5, so a post is made
 * at 3:4 and the app trims it to 4:5.
 */
export const STYLE_ASPECT: Record<PromoteShapeId, string> = { post: '3:4', square: '1:1', story: '9:16' };

/** What the server answers for POST /api/ai/promote/style and /api/mobile/promote/style. */
export interface StyleResult {
  /** The restyled photo, JPEG, base64. */
  image: string;
  width: number;
  height: number;
  /** Photos that can still be styled (the smaller of today's and this month's). */
  stylesLeft: number;
}

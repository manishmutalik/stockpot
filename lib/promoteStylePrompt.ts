/**
 * promoteStylePrompt.ts
 *
 * What the image model is told when it restyles a photo of food (Promote's Styled photo). The owner's rule is in it
 * plainly: the food may be touched up, but nothing physical about it changes, and nothing is added or taken away. The
 * setting around the plate, the light and the camera's polish are the model's to change.
 */
import type { PromoteStyle } from '../src/utils/promoteStyles';

export function buildStylePrompt(style: PromoteStyle): string {
  return [
    'Edit this photo into a professional, appetising food photograph for a small food business\'s Instagram.',
    '',
    'Keep the food exactly as it is physically: the same dishes and items, the same quantity, the same shapes, sizes, cuts, ' +
      'arrangement and placement, and the same plate or bowl with its pattern. Do not add anything to the food: no garnish, ' +
      'herbs, sauce, drizzle, oil, seeds or extra pieces. Do not remove or move any of it. The customer must receive what is in the picture.',
    'You may touch up the food: better light and colour, natural sheen, crisper detail, and cleaning smudges or crumbs off the plate rim.',
    `Replace everything around the plate with this setting: ${style.scene}. Small props beside the plate (a napkin, cutlery, a glass) are fine; ` +
      'nothing on the plate.',
    'Photograph it from about the same angle as the original, with the plate as the clear subject, roughly centred, and the whole plate in frame.',
    'No text, logos, watermarks, hands or people.',
  ].join('\n');
}

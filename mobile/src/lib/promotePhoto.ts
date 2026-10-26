/**
 * promotePhoto.ts
 *
 * The parts of Promote that need the phone: taking or choosing the photo and shrinking it (to PROMOTE_PHOTO_MAX_SIDE, as
 * JPEG), keeping the improved photo the server sends back in the app's cache, cutting it to a post or a story around the
 * food, and handing that to the share sheet with the caption on the clipboard (Instagram does not take the caption from
 * the share sheet, so the owner pastes it). Every file is in the cache and is deleted when the owner starts again or
 * leaves; nothing goes to the gallery unless the owner saves it from the share sheet.
 */
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { cropRect, PROMOTE_PHOTO_MAX_SIDE, type Focus, type PromoteShape } from '../../../src/utils/promote';
import type { RecipePhoto } from '../../../src/utils/recipeParse';

export interface PickedPromotePhoto { uri: string; photo: RecipePhoto }
export type PromotePick = { ok: true; picked: PickedPromotePhoto } | { ok: false; message: string } | { ok: false; cancelled: true };

/** Takes a photo with the camera, or chooses one from the gallery, and shrinks it. */
export async function pickPromotePhoto(from: 'camera' | 'gallery'): Promise<PromotePick> {
  try {
    if (from === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return { ok: false, message: 'Stockpot Quick needs the camera to take the photo. Allow it in your phone’s settings, or choose a photo from the gallery.' };
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
    const result = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? undefined : result.assets?.[0];
    if (!asset) return { ok: false, cancelled: true };
    const context = ImageManipulator.manipulate(asset.uri);
    if (Math.max(asset.width || 0, asset.height || 0) > PROMOTE_PHOTO_MAX_SIDE) {
      context.resize(asset.width >= asset.height ? { width: PROMOTE_PHOTO_MAX_SIDE } : { height: PROMOTE_PHOTO_MAX_SIDE });
    }
    const saved = await (await context.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
    if (!saved.base64) throw new Error('unreadable');
    return { ok: true, picked: { uri: saved.uri, photo: { mediaType: 'image/jpeg', data: saved.base64 } } };
  } catch {
    return { ok: false, message: 'That photo could not be opened. Please try another.' };
  }
}

/** Keeps the improved photo (JPEG, base64) in the cache, to be cropped and shared; returns its address (in the browser, a data address). */
export function keepImproved(imageBase64: string): string {
  if (Platform.OS === 'web') return `data:image/jpeg;base64,${imageBase64}`;
  const file = new File(Paths.cache, `promote-${Date.now()}.jpg`);
  file.write(imageBase64, { encoding: 'base64' });
  return file.uri;
}

/** The improved photo cut to the shape around the food, at the shape's size; returns the new file's address. */
export async function cropForShare(uri: string, size: { width: number; height: number }, shape: PromoteShape, focus: Focus): Promise<string> {
  const r = cropRect(size.width, size.height, shape, focus);
  const image = await ImageManipulator.manipulate(uri)
    .crop({ originX: r.x, originY: r.y, width: r.width, height: r.height })
    .resize({ width: shape.width, height: shape.height })
    .renderAsync();
  return (await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 })).uri;
}

/** Copies the caption, then opens the share sheet with the photo. False when this phone cannot share files. */
export async function sharePost(uri: string, text: string): Promise<boolean> {
  await Clipboard.setStringAsync(text);
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Post your photo' });
  return true;
}

export const copyCaption = (text: string) => Clipboard.setStringAsync(text);

/** Deletes files this screen made; one already gone is fine. */
export function forget(uris: (string | null | undefined)[]): void {
  for (const uri of uris) {
    if (!uri || !uri.startsWith('file:')) continue;
    try { new File(uri).delete(); } catch { /* already gone */ }
  }
}

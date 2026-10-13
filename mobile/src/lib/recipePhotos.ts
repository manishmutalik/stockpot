/**
 * recipePhotos.ts
 *
 * Photos of a recipe for the recipe reader: taken with the camera or chosen from the gallery, then shrunk on the phone (the
 * longest side to RECIPE_PHOTO_MAX_SIDE, as JPEG) before they are sent, as the web does. Smaller photos send quicker on a
 * phone connection and cost less to read, and the handwriting stays readable. Nothing is kept: the shrunk copy is only
 * held in memory until the recipe is read.
 */
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { RECIPE_PHOTO_MAX_SIDE, type RecipePhoto } from '../../../src/utils/recipeParse';

/** A photo ready to send, with the shrunk copy's address for showing it on the screen. */
export interface PickedPhoto { uri: string; photo: RecipePhoto }

export type PickResult = { ok: true; photos: PickedPhoto[] } | { ok: false; message: string } | { ok: false; cancelled: true };

async function shrink(asset: ImagePicker.ImagePickerAsset): Promise<PickedPhoto> {
  const longest = Math.max(asset.width || 0, asset.height || 0);
  const context = ImageManipulator.manipulate(asset.uri);
  if (longest > RECIPE_PHOTO_MAX_SIDE) {
    context.resize(asset.width >= asset.height ? { width: RECIPE_PHOTO_MAX_SIDE } : { height: RECIPE_PHOTO_MAX_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new Error('unreadable');
  return { uri: saved.uri, photo: { mediaType: 'image/jpeg', data: saved.base64 } };
}

/** Takes a photo with the camera (`camera`), or chooses up to `limit` from the gallery, and shrinks them. */
export async function pickRecipePhotos(from: 'camera' | 'gallery', limit: number): Promise<PickResult> {
  try {
    if (from === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return { ok: false, message: 'Stockpot Quick needs the camera to photograph a recipe. Allow it in your phone’s settings, or choose a photo from the gallery.' };
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
    const result = from === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: limit > 1, selectionLimit: limit, orderedSelection: true });
    if (result.canceled || !result.assets?.length) return { ok: false, cancelled: true };
    const photos = await Promise.all(result.assets.slice(0, limit).map(shrink));
    return { ok: true, photos };
  } catch {
    return { ok: false, message: 'That photo could not be opened. Try another, or type the recipe.' };
  }
}

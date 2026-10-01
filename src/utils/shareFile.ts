/**
 * shareFile.ts
 *
 * The two ways a generated file (a bill image, a menu PDF) leaves the app:
 * saved to the device, or handed to the phone's share sheet so WhatsApp is one
 * tap away with the file already attached. Shared by BillModal and
 * MenuShareModal.
 */

/** Saves a file to the device (a normal browser download). */
export function saveFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Opens the native share sheet with the file attached, where the browser can
 * share files (most phones).
 *  - 'shared':      the share sheet opened and the owner chose or finished.
 *  - 'cancelled':   the owner closed the share sheet; do nothing more.
 *  - 'unsupported': this browser can't share files (typically desktop); fall back.
 */
export async function shareFileViaSystem(file: File, text: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (typeof navigator.canShare !== 'function' || !navigator.canShare({ files: [file] })) return 'unsupported';
  try {
    await navigator.share({ files: [file], text });
    return 'shared';
  } catch (err: any) {
    return err?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

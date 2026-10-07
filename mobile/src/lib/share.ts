import { Linking, Share } from 'react-native';

/**
 * Shares a message the server wrote (a pre-order confirmation, a bill): into WhatsApp straight to the customer when there is
 * a link for that, otherwise through the phone's share sheet so the owner picks the app and the person.
 */
export async function shareMessage(input: { message: string; whatsappUrl?: string | null }): Promise<void> {
  if (input.whatsappUrl) {
    try { await Linking.openURL(input.whatsappUrl); return; } catch { /* no way to open it: fall back to the share sheet */ }
  }
  await Share.share({ message: input.message });
}

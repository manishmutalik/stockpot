/**
 * expoPush.ts
 *
 * Sends push notifications through Expo's push service (https://docs.expo.dev/push-notifications/sending-notifications/).
 * One call sends any number of messages (Expo takes up to 100 per request) and says, message by message, whether Expo
 * accepted it. A token Expo reports as `DeviceNotRegistered` is dead (the app was removed): the caller stops using it.
 * `EXPO_ACCESS_TOKEN` is optional and only needed if the Expo project has enhanced push security switched on.
 */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  /** Expo accepted it for delivery. */
  ok: boolean;
  /** The token is dead: do not send to it again. */
  invalidToken?: boolean;
  error?: string;
}

export type PushSender = (messages: PushMessage[]) => Promise<PushResult[]>;

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100;

export function createExpoPushSender(opts: { fetchImpl?: typeof fetch; accessToken?: string; url?: string } = {}): PushSender {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = opts.url ?? EXPO_PUSH_URL;
  return async messages => {
    const results: PushResult[] = [];
    for (let i = 0; i < messages.length; i += CHUNK) {
      const chunk = messages.slice(i, i + CHUNK);
      try {
        const res = await doFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.accessToken && { Authorization: `Bearer ${opts.accessToken}` }) },
          body: JSON.stringify(chunk.map(m => ({ to: m.to, title: m.title, body: m.body, data: m.data ?? {}, sound: 'default', priority: 'high' }))),
        });
        const json: any = await res.json().catch(() => null);
        if (!res.ok || !json || !Array.isArray(json.data) || json.data.length !== chunk.length) {
          const error = `expo_${res.status}`;
          chunk.forEach(() => results.push({ ok: false, error }));
          continue;
        }
        for (const ticket of json.data) {
          if (ticket?.status === 'ok') results.push({ ok: true });
          else {
            const code = ticket?.details?.error;
            results.push({ ok: false, error: typeof code === 'string' ? code : 'rejected', ...(code === 'DeviceNotRegistered' && { invalidToken: true }) });
          }
        }
      } catch (err: any) {
        const error = `network:${String(err?.message ?? 'failed').slice(0, 60)}`;
        chunk.forEach(() => results.push({ ok: false, error }));
      }
    }
    return results;
  };
}

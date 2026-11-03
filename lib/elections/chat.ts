/**
 * Live chat — the pure half: message shape and the text rules. Client-safe.
 *
 * Election night is the highest-stakes room on the site for scams and
 * misinformation, so the rules are strict and boring: plain text, 280 chars,
 * NO links (phishing, "vote by text" scams, fake results sites), control and
 * bidi-override characters stripped, runs of repeats collapsed. Anything else
 * (rate limit, sign-in) is the route's job.
 */

export const MAX_CHAT_LENGTH = 280;
export const CHAT_HISTORY = 100;

export interface ChatMessage {
  id: string;
  /** Room = the election date, YYYY-MM-DD. */
  room: string;
  userId: string;
  name: string;
  handle: string | null;
  image: string | null;
  text: string;
  /** Epoch ms. */
  at: number;
}

export type ChatEvent =
  | { type: 'msg'; msg: ChatMessage }
  | { type: 'del'; id: string }
  /** A one-tap reaction; ephemeral, never stored in history. */
  | { type: 'react'; emoji: string; at: number }
  /** The room's host changed the shared screen; every member's overlay re-renders from this. */
  | { type: 'config'; config: unknown };

export type ChatTextResult = { ok: true; text: string } | { ok: false; reason: 'empty' | 'links' | 'too-long' };

// Control chars, zero-width, and the bidi overrides used to spoof text direction.
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const URL_LIKE =
  /(?:https?:\/\/|www\.|\b[a-z0-9-]+\s?(?:\.|\[dot\]|\(dot\)|\sdot\s)\s?(?:com|net|org|io|co|gg|ly|tv|me|xyz|ru|cn|app|dev|info|biz|us|vote|gov|link|click|top|site|online|shop|live|news)\b|\bt\.me\/|\bbit\.ly)/i;

export function sanitizeChatText(raw: string): ChatTextResult {
  const text = raw
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    // "aaaaaaaa" → "aaa": a wall of one character is noise, not speech.
    .replace(/(.)\1{5,}/gu, '$1$1$1')
    .trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > MAX_CHAT_LENGTH) return { ok: false, reason: 'too-long' };
  if (URL_LIKE.test(text)) return { ok: false, reason: 'links' };
  return { ok: true, text };
}

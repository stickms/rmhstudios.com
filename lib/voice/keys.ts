/**
 * Object keys and playback URLs for DM voice notes.
 *
 * ## Why voice does not use `feedImageKey` / the CDN
 *
 * Feed images are public by design — they are served straight off
 * `cdn.rmhstudios.com` with an unguessable filename and no auth. A voice note in
 * a private conversation is not that. A CDN URL is a bearer token that never
 * expires and is trivially forwarded, so DM audio is served **only** through
 * `/api/messages/voice/$filename`, which re-checks that the requester is a
 * participant of the conversation the clip belongs to. The cost is losing edge
 * caching on objects that are played once or twice; the alternative is a private
 * conversation whose audio is a public URL.
 *
 * That authorization check is the reason the conversation id is *in* the
 * filename: it turns "may this person hear this?" into one primary-key lookup
 * instead of a scan over an unindexed `audioUrl` column.
 *
 * Pure and client-safe — the recorder builds nothing here, but the player needs
 * {@link voicePlaybackUrl} and the tests need the parser.
 */

/** Storage prefix. Separate namespace from `rmharks/` so serving rules can differ. */
export const VOICE_PREFIX = 'dm-voice/';

/**
 * `_` is the field separator. Conversation ids are cuids (`[a-z0-9]+`), so the
 * separator can never appear inside the id, and `_` is allowed by
 * `isSafeFilename`.
 */
const FILENAME_RE = /^([A-Za-z0-9]+)_([A-Za-z0-9-]+)\.([A-Za-z0-9]{2,4})$/;

/** Container extensions a browser `MediaRecorder` can hand us. */
const EXT_BY_TYPE: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
};

const TYPE_BY_EXT: Record<string, string> = {
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
};

/** Container extension for a recorder MIME type (codec parameters ignored). */
export function voiceExtForContentType(contentType: string): string | null {
  const base = contentType.toLowerCase().split(';')[0].trim();
  return EXT_BY_TYPE[base] ?? null;
}

/** MIME type to serve a stored object with, derived from its filename. */
export function voiceContentTypeForFilename(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
  return TYPE_BY_EXT[ext] ?? 'application/octet-stream';
}

/**
 * `<conversationId>_<random>.<ext>`.
 *
 * The random half is caller-supplied so the server controls entropy (and tests
 * stay deterministic). It must be `[A-Za-z0-9-]+`.
 */
export function voiceFilename(conversationId: string, unique: string, ext: string): string {
  return `${conversationId}_${unique}.${ext.replace(/^\./, '')}`;
}

/** The conversation a filename belongs to, or `null` if it is not one of ours. */
export function parseVoiceFilename(
  filename: string,
): { conversationId: string; unique: string; ext: string } | null {
  const m = FILENAME_RE.exec(filename);
  if (!m) return null;
  if (!TYPE_BY_EXT[m[3].toLowerCase()]) return null;
  return { conversationId: m[1], unique: m[2], ext: m[3].toLowerCase() };
}

export function voiceObjectKey(filename: string): string {
  return `${VOICE_PREFIX}${filename}`;
}

/**
 * The URL stored in `DirectMessage.audioUrl` and used by `<audio src>`.
 *
 * A same-origin API path, never a CDN origin — see the note at the top of this
 * file.
 */
export function voicePlaybackUrl(filename: string): string {
  return `/api/messages/voice/${filename}`;
}

/** Recover the filename from a stored `audioUrl`. `null` for anything else. */
export function voiceFilenameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const prefix = '/api/messages/voice/';
  if (!url.startsWith(prefix)) return null;
  const filename = url.slice(prefix.length).split('?')[0];
  return parseVoiceFilename(filename) ? filename : null;
}

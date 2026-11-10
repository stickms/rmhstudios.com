/**
 * Slice It — genres, tags and the timestamp convention (`L1`, `L5`).
 *
 * A song has title, artist, album, description and cover; browse is search plus
 * five sorts. A library of a thousand charts is therefore navigable only by
 * remembering a name.
 *
 * Pure and browser-safe: the upload form, the facet UI and the API all validate
 * against the same vocabulary, and the one that has its own copy is the one
 * that lets a 401st spelling of "drum and bass" into the facet.
 */

/**
 * The curated genre list.
 *
 * Curated, not free text, and that is the whole design of `L1`. A facet built
 * on a free-text field is a list of typos: browse by "Drum & Bass", "drum and
 * bass", "DnB" and "dnb" and you have four rows and no facet. Tags below are
 * where the long tail lives.
 *
 * Chosen for what people upload to a rhythm game rather than for musicological
 * completeness — "VOCALOID" and "Touhou" are on this list and "Baroque" is not,
 * because one of those is half of every rhythm game library and the other is a
 * tag.
 */
export const SONG_GENRES = [
  'electronic',
  'dnb',
  'dubstep',
  'house',
  'trance',
  'hardcore',
  'rock',
  'metal',
  'pop',
  'hiphop',
  'jazz',
  'classical',
  'folk',
  'jpop',
  'kpop',
  'vocaloid',
  'touhou',
  'anime',
  'game',
  'chiptune',
  'ambient',
  'other',
] as const;

export type SongGenre = (typeof SONG_GENRES)[number];

export function isSongGenre(value: unknown): value is SongGenre {
  return typeof value === 'string' && (SONG_GENRES as readonly string[]).includes(value);
}

/** How many tags one song may carry. */
export const MAX_TAGS_PER_SONG = 8;
/** Longest a single tag may be. */
export const MAX_TAG_LENGTH = 24;

/**
 * Normalise one tag.
 *
 * Lowercased, stripped of everything but letters, digits and inner hyphens,
 * then collapsed. The point is that `"Hand Charted"`, `"hand-charted"` and
 * `"  HAND CHARTED  "` are one tag: a tag facet whose entries differ by case
 * and whitespace is a tag facet with three entries for one idea, which is the
 * exact failure `genre` is curated to avoid.
 *
 * Returns `null` for anything that normalises to nothing.
 */
export function normaliseTag(raw: string): string | null {
  const tag = raw
    .normalize('NFKD')
    // Strip combining marks, so "café" and "cafe" are one tag.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TAG_LENGTH)
    // A slice can leave a trailing hyphen behind.
    .replace(/-+$/g, '');
  return tag.length > 0 ? tag : null;
}

/** Normalise, de-duplicate and cap a tag list. */
export function normaliseTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const entry of raw) {
    const tag = normaliseTag(entry);
    if (tag) seen.add(tag);
    if (seen.size >= MAX_TAGS_PER_SONG) break;
  }
  return [...seen];
}

/* ─── L5 — timestamps in comments ────────────────────────────────────────── */

/**
 * `1:42`, `01:42`, `1:42.500`.
 *
 * Anchored to a word boundary rather than to the string start so a timestamp
 * mid-sentence is found ("the jump at 1:42 is unreadable"), which is how people
 * actually write them.
 */
const TIMESTAMP = /(?:^|\s)(\d{1,2}):([0-5]\d)(?:\.(\d{1,3}))?(?=\s|$|[,.;!?)])/;

/**
 * Pull a position out of a comment body.
 *
 * PARSED rather than collected by a separate field in the compose UI. osu!
 * modding taught a generation of players to type timestamps, and a field nobody
 * fills is worse than a convention they already have.
 *
 * A timestamp past the end of the song is `null`, not a clamp: "12:00" in a
 * three-minute song is somebody writing about something else (a version, a
 * date, a score), and jumping playback to the end for it would be worse than
 * ignoring it.
 */
export function extractTimestamp(body: string, duration: number): number | null {
  const match = TIMESTAMP.exec(body);
  if (!match) return null;
  const fraction = match[3] ? Number(match[3]) / Math.pow(10, match[3].length) : 0;
  const seconds = Number(match[1]) * 60 + Number(match[2]) + fraction;
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds <= duration ? seconds : null;
}

/** Format seconds back into the convention, for rendering a marker's label. */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

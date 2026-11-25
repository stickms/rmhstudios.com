/**
 * RMHTube subtitles (sprint 11 16) — pure, shared by the browser and the hub.
 *
 * A subtitle file is parsed in the browser into plain-text cues `{ start, end, text }` (milliseconds); only the cues are
 * sent, and the server runs the same `normalizeCue` and `validateCues` again. Nothing here produces markup: every `<…>`
 * tag is removed, entities are decoded AFTER that (so a decoded `&lt;script&gt;` stays literal text), control and bidi
 * controls are removed, and the overlay renders the result as a React text child.
 */

export interface SubtitleCue {
  /** Milliseconds from the start of the video. */
  start: number;
  end: number;
  text: string;
}

/** A track as the room sees it: the labels travel with the queue, the cues are fetched once per item. */
export interface SubtitleLabel {
  id: string;
  label: string;
  lang: string | null;
  cueCount: number;
}

export const SUBTITLE_LIMITS = {
  /** Checked on `File.size` before the file is read. */
  MAX_FILE_BYTES: 256 * 1024,
  MAX_CUES: 5000,
  MAX_CUE_CHARS: 500,
  MAX_CUE_LINES: 3,
  /** The whole serialised cue JSON; keeps a message under the hub's 1 MB buffer. */
  MAX_JSON_BYTES: 512 * 1024,
  MAX_PER_ITEM: 3,
  MAX_LABEL_CHARS: 40,
  /** A cue past two days is a typo, not a video. */
  MAX_TIME_MS: 48 * 60 * 60 * 1000,
} as const;

export type SubtitleRefusal =
  'empty' | 'no_cues' | 'too_many_cues' | 'too_large' | 'unordered' | 'invalid_cue' | 'bad_label' | 'bad_lang';

// ─── Text ───────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&lrm;': String.fromCharCode(0x200e),
  '&rlm;': String.fromCharCode(0x200f),
};

/**
 * Characters never kept in a cue or a label: control characters other than the line break (tab is made a space first),
 * DEL and the C1 range, the line and paragraph separators, the bidi embeddings and overrides (U+202A to U+202E) and the
 * isolates (U+2066 to U+2069). The marks LRM and RLM stay. Written as code points so no invisible character sits in source.
 */
function isStrippedCode(c: number): boolean {
  if (c === 0x0a) return false;
  return (
    c <= 0x1f ||
    (c >= 0x7f && c <= 0x9f) ||
    c === 0x2028 ||
    c === 0x2029 ||
    (c >= 0x202a && c <= 0x202e) ||
    (c >= 0x2066 && c <= 0x2069)
  );
}

function stripControls(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (!isStrippedCode(text.charCodeAt(i))) out += text[i];
  }
  return out;
}

/** Remove every tag, repeatedly so `<v <b>>` cannot leave one behind; then an unclosed `<tag` to the end of its line. */
function stripTags(line: string): string {
  let out = line;
  for (let i = 0; i < 8; i++) {
    const next = out.replace(/<[A-Za-z0-9/!?][^<>]*>/g, '');
    if (next === out) break;
    out = next;
  }
  // A tag that never closes (`<b`, `</i`, `<!--`, `<?x`) is dropped to the end of the line.
  out = out.replace(/<[A-Za-z0-9/!?][^\n]*$/, '');
  // A leftover `<` that would still open a tag (a letter, `/`, `!` or `?` right after it) is removed.
  return out.replace(/<(?=[A-Za-z0-9/!?])/g, '');
}

function clipChars(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  // Do not end on half of a surrogate pair.
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut;
}

/** Plain text for one cue: tags out, then entities, then controls; at most three lines and 500 characters. */
export function normalizeCueText(raw: string): string {
  const lines = String(raw)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const decoded = stripTags(line.replace(/\t/g, ' ')).replace(
        /&(?:amp|lt|gt|nbsp|lrm|rlm);/g,
        (m) => ENTITIES[m] ?? m,
      );
      return stripControls(decoded).replace(/ {2,}/g, ' ').trim();
    })
    .filter((line) => line.length > 0)
    .slice(0, SUBTITLE_LIMITS.MAX_CUE_LINES);
  return clipChars(lines.join('\n'), SUBTITLE_LIMITS.MAX_CUE_CHARS);
}

/** One cue made safe, or null when it cannot be a cue (bad times, or no text left). Shared by browser and server. */
export function normalizeCue(raw: unknown): SubtitleCue | null {
  if (!raw || typeof raw !== 'object') return null;
  const { start, end, text } = raw as Record<string, unknown>;
  if (typeof start !== 'number' || typeof end !== 'number' || typeof text !== 'string') return null;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const s = Math.round(start);
  const e = Math.round(end);
  if (s < 0 || e <= s || e > SUBTITLE_LIMITS.MAX_TIME_MS) return null;
  const clean = normalizeCueText(text);
  if (!clean) return null;
  return { start: s, end: e, text: clean };
}

// ─── Parsing ────────────────────────────────────────────────────────────

const TIME = String.raw`(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})`;
const TIMING = new RegExp(String.raw`^\s*${TIME}\s*-->\s*${TIME}(?:[ \t].*)?$`);

function toMs(h: string | undefined, m: string, s: string, frac: string): number {
  return (Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s)) * 1000 + Number(frac.padEnd(3, '0'));
}

export type ParseResult =
  | { ok: true; cues: SubtitleCue[]; dropped: number }
  | { ok: false; reason: Extract<SubtitleRefusal, 'empty' | 'no_cues' | 'too_many_cues' | 'too_large'> };

const SKIPPED_BLOCK = /^(?:NOTE|STYLE|REGION)(?:[ \t]|$)/;

/**
 * Read WebVTT or SRT text into cues. Blocks that are `NOTE`, `STYLE` or `REGION` are dropped whole (CSS is never applied
 * anywhere), as are cue settings after the end time and cue identifiers. Cues are returned ordered by start time.
 */
export function parseSubtitles(source: string): ParseResult {
  const raw = String(source);
  const text = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).replace(/\r\n?/g, '\n');
  if (text.trim() === '') return { ok: false, reason: 'empty' };
  if (new TextEncoder().encode(text).length > SUBTITLE_LIMITS.MAX_FILE_BYTES) return { ok: false, reason: 'too_large' };

  const cues: SubtitleCue[] = [];
  let dropped = 0;
  for (const block of text.split(/\n[ \t]*\n/)) {
    const lines = block.split('\n');
    while (lines.length > 0 && lines[0]!.trim() === '') lines.shift();
    if (lines.length === 0) continue;
    const first = lines[0]!.trim();
    if (first.startsWith('WEBVTT') || SKIPPED_BLOCK.test(first)) continue;
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at === -1) continue;
    const m = TIMING.exec(lines[at]!);
    if (!m) {
      dropped++;
      continue;
    }
    const start = toMs(m[1], m[2]!, m[3]!, m[4]!);
    const end = toMs(m[5], m[6]!, m[7]!, m[8]!);
    const cue = normalizeCue({ start, end, text: lines.slice(at + 1).join('\n') });
    if (!cue) {
      dropped++;
      continue;
    }
    cues.push(cue);
    if (cues.length > SUBTITLE_LIMITS.MAX_CUES) return { ok: false, reason: 'too_many_cues' };
  }
  if (cues.length === 0) return { ok: false, reason: 'no_cues' };
  // Files are sometimes out of order; the stored list never is (stable on ties).
  const ordered = cues.map((c, i) => [c, i] as const).sort((a, b) => a[0].start - b[0].start || a[1] - b[1]);
  return { ok: true, cues: ordered.map(([c]) => c), dropped };
}

// ─── Validation (browser and server) ────────────────────────────────────

/** Bytes of the serialised cue list, as stored and as sent. */
export function serialisedCueBytes(cues: readonly SubtitleCue[]): number {
  return new TextEncoder().encode(JSON.stringify(cues)).length;
}

export type ValidateResult = { ok: true; cues: SubtitleCue[] } | { ok: false; reason: SubtitleRefusal };

/**
 * The server's gate (and the client's last check): every cue goes through `normalizeCue`, times are non-negative with
 * the end after the start, ordered by start, at most 5,000, at most 512 KB serialised. Refuses rather than repairs.
 */
export function validateCues(input: unknown): ValidateResult {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, reason: 'no_cues' };
  if (input.length > SUBTITLE_LIMITS.MAX_CUES) return { ok: false, reason: 'too_many_cues' };
  const cues: SubtitleCue[] = [];
  let prev = -1;
  for (const raw of input) {
    const cue = normalizeCue(raw);
    if (!cue) return { ok: false, reason: 'invalid_cue' };
    if (cue.start < prev) return { ok: false, reason: 'unordered' };
    prev = cue.start;
    cues.push(cue);
  }
  if (serialisedCueBytes(cues) > SUBTITLE_LIMITS.MAX_JSON_BYTES) return { ok: false, reason: 'too_large' };
  return { ok: true, cues };
}

/** A track's label: trimmed, 1 to 40 characters, no control characters. */
export function normalizeLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const clean = stripControls(raw.replace(/\s+/g, ' ')).trim();
  if (clean.length === 0 || clean.length > SUBTITLE_LIMITS.MAX_LABEL_CHARS) return null;
  return clean;
}

/** A BCP 47 tag in canonical form, or null when it is not one (empty is "none"; use `isLangOk`). */
export function normalizeLang(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.length > 16) return null;
  try {
    return Intl.getCanonicalLocales(trimmed)[0] ?? null;
  } catch {
    return null;
  }
}

// ─── Playback ───────────────────────────────────────────────────────────

/**
 * The cue showing at `ms`, or null. Cues are ordered by start; a binary search finds the last one that has started, and
 * a little scan back covers a long cue that overlaps a later short one. A cue shows from its start up to, not
 * including, its end.
 */
export function activeCueAt(cues: readonly SubtitleCue[], ms: number): SubtitleCue | null {
  if (cues.length === 0 || !Number.isFinite(ms) || ms < 0) return null;
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid]!.start <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  for (let i = found, steps = 0; i >= 0 && steps < 8; i--, steps++) {
    const c = cues[i]!;
    if (ms < c.end) return c;
  }
  return null;
}

// ─── Viewer preference ──────────────────────────────────────────────────

export type SubtitleSize = 'small' | 'medium' | 'large';
export const SUBTITLE_SIZES: readonly SubtitleSize[] = ['small', 'medium', 'large'];

export interface SubtitlePrefs {
  /** The last chosen label; null is Off. */
  label: string | null;
  size: SubtitleSize;
}

export const SUBTITLE_PREFS_KEY = 'rmh:rmhtube:subtitles';
export const DEFAULT_SUBTITLE_PREFS: SubtitlePrefs = { label: null, size: 'medium' };

/** Read a stored preference defensively: anything off-shape is the default. */
export function coerceSubtitlePrefs(raw: unknown): SubtitlePrefs {
  if (!raw || typeof raw !== 'object') return DEFAULT_SUBTITLE_PREFS;
  const { label, size } = raw as Record<string, unknown>;
  return {
    label: typeof label === 'string' && normalizeLabel(label) === label ? label : null,
    size: SUBTITLE_SIZES.includes(size as SubtitleSize) ? (size as SubtitleSize) : 'medium',
  };
}

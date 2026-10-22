/**
 * Profile identity extras — client-safe rules shared by the settings editor,
 * the profile renderers and the API routes (P2 /now, P3 pronouns and name
 * pronunciation, P4 local time, P9 visitor counter).
 * Feature ideas in docs/plans/2026-10-12-feature-ideas-every-surface.md.
 *
 * The data lives in `ProfilePlus` (one optional row per member). Everything
 * here is pure: validation, the 60-day "stale" rule for /now, link-splitting for
 * /now text, and the Intl-based clock used for "It's 2:14 am for Ana".
 *
 * zod-free — the profile page renders /now and the local clock from here. The
 * settings-write schema is in `./plus-schema`.
 */

/* -------------------------------------------------------------------------- */
/* P3 — pronouns                                                              */
/* -------------------------------------------------------------------------- */

export const PRONOUNS_MAX = 40;

/* -------------------------------------------------------------------------- */
/* P3 — pronunciation clip                                                    */
/* -------------------------------------------------------------------------- */

/** The recorder stops itself here. */
export const PRONUNCIATION_MAX_MS = 5000;
/** The server accepts a little over, for encoder start-up/flush padding. */
export const PRONUNCIATION_ACCEPT_MS = 5600;
/** 5 s of speech is ~15 KB at the recorder's bitrate; this leaves room for Safari's AAC. */
export const PRONUNCIATION_MAX_BYTES = 160 * 1024;
/** Recorder bitrate hint (bits per second). */
export const PRONUNCIATION_BITRATE = 32_000;

/* -------------------------------------------------------------------------- */
/* P4 — timezone                                                              */
/* -------------------------------------------------------------------------- */

const TZ_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/;

/** True for a real IANA zone name the runtime's Intl knows. */
export function isValidTimeZone(tz: string): boolean {
  if (tz.length === 0 || tz.length > 64 || !TZ_SHAPE.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface LocalClock {
  /** "2:14 AM" — in the viewer's locale and 12/24-hour preference. */
  time: string;
  /** 0–23 in the member's zone. */
  hour: number;
  /** Between 22:00 and 07:00 there — the "think before you ping" window. */
  isNight: boolean;
}

/** The wall clock in `timezone` at `now`, or null when the zone is unusable. */
export function localClock(
  timezone: string,
  now: Date = new Date(),
  locale?: string,
): LocalClock | null {
  try {
    const time = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(now);
    const hourPart = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now);
    const hour = Number(hourPart) % 24;
    return { time, hour, isNight: hour >= 22 || hour < 7 };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* P2 — /now                                                                  */
/* -------------------------------------------------------------------------- */

export const NOW_MAX = 500;
/** After this many days without an edit the block greys out. */
export const NOW_STALE_DAYS = 60;

/** True when the /now text was last updated more than {@link NOW_STALE_DAYS} ago. */
export function nowIsStale(
  updatedAt: Date | string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!updatedAt) return false;
  const t = typeof updatedAt === 'string' ? Date.parse(updatedAt) : updatedAt.getTime();
  if (!Number.isFinite(t)) return false;
  return now - t > NOW_STALE_DAYS * 24 * 60 * 60 * 1000;
}

export type NowSegment =
  { type: 'text'; value: string } | { type: 'link'; value: string; href: string };

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCT = /[.,;:!?)\]}]+$/;

/**
 * Split plain text into text and link segments. Only http(s) URLs become links —
 * the text is otherwise rendered as text, so nothing here can inject markup.
 */
export function splitNowText(text: string): NowSegment[] {
  const out: NowSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    let raw = match[0];
    const trail = TRAILING_PUNCT.exec(raw);
    if (trail) raw = raw.slice(0, raw.length - trail[0].length);
    let href: string | null = null;
    try {
      const u = new URL(raw);
      if (u.protocol === 'http:' || u.protocol === 'https:') href = u.toString();
    } catch {
      href = null;
    }
    if (!href) continue;
    if (start > last) out.push({ type: 'text', value: text.slice(last, start) });
    out.push({ type: 'link', value: raw, href });
    last = start + raw.length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

/* -------------------------------------------------------------------------- */
/* Settings write                                                             */
/* -------------------------------------------------------------------------- */

/** PUT body for `/api/profile/plus` — the schema is `plusUpdateSchema` in `./plus-schema`. */
export type { PlusUpdateInput } from './plus-schema';

/** What `GET /api/profile/$id/plus` returns (public, opt-in fields only). */
export interface ProfilePlusView {
  pronouns: string | null;
  timezone: string | null;
  nowText: string | null;
  nowUpdatedAt: string | null;
  counterEnabled: boolean;
}

/** The stored pronunciation clip's playback URL for a member, versioned by object key. */
export function pronunciationUrl(userId: string, key: string | null | undefined): string | null {
  if (!key) return null;
  const version =
    key
      .split('/')
      .pop()
      ?.replace(/\.[A-Za-z0-9]+$/, '') ?? '';
  return `/api/profile/${encodeURIComponent(userId)}/pronunciation?v=${encodeURIComponent(version)}`;
}

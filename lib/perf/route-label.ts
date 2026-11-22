// Low-cardinality route labels for the performance collector.
//
// WHY THIS IS ITS OWN FILE: every metric the collector keeps is keyed by a route
// label in a bounded Map, and the whole memory story ("routes <= 300 labels")
// rests on this function mapping the unbounded URL space onto a small set. Left
// to inline string slicing it would drift between the request hook, the error
// hook and the 500 path in `defineHandler`; as a pure, dependency-free function
// it has one definition and a unit test (`__tests__/route-label.test.ts`).
//
// Pure Node/TS with no imports on purpose: the hubs' esbuild bundles and the
// Nitro plugins both load it by relative path.

/** Segments kept in a label. Deeper paths share the label of their 4-segment prefix. */
export const MAX_LABEL_SEGMENTS = 4;

/** Anything longer than this is a slug/token, not a route word. */
const MAX_SEGMENT_LENGTH = 48;

/**
 * File extensions that mean "a static asset". The label for such a request is
 * `static:<ext>` regardless of the path, because the hashed filename
 * (`/assets/index-DgX3k9.js`) is both unbounded and useless as a label — what
 * an operator wants to know is how much traffic is static, not which file.
 */
const STATIC_EXTENSIONS = new Set([
  'js',
  'mjs',
  'css',
  'map',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
  'ico',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'mp3',
  'mp4',
  'webm',
  'ogg',
  'wav',
  'm4a',
  'wasm',
  'txt',
  'xml',
  'json',
  'webmanifest',
  'pdf',
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGITS = /^\d+$/;
const HEX_LONG = /^[0-9a-f]{12,}$/i;
// cuid is 25 chars, cuid2 24 — 20+ alphanumerics with no separator is an id.
const CUID_LIKE = /^[A-Za-z0-9]{20,}$/;

/** True when one path segment is an identifier rather than a route word. */
export function isIdSegment(segment: string): boolean {
  return (
    DIGITS.test(segment) ||
    UUID.test(segment) ||
    HEX_LONG.test(segment) ||
    CUID_LIKE.test(segment) ||
    segment.length > MAX_SEGMENT_LENGTH
  );
}

/** The lower-cased extension of the final segment, or null when it has none. */
function extensionOf(segment: string): string | null {
  const dot = segment.lastIndexOf('.');
  if (dot <= 0 || dot === segment.length - 1) return null;
  return segment.slice(dot + 1).toLowerCase();
}

/**
 * Collapse a request URL or path into a bounded label.
 *
 * - query string and fragment are dropped;
 * - a final segment with a known static extension makes the whole label
 *   `static:<ext>`;
 * - id-shaped segments (uuid, cuid, digits, long hex, anything over 48 chars)
 *   and any other segment containing a dot become `:id`;
 * - a `@handle` segment becomes `@:id` — profile traffic stays visibly
 *   profile traffic, with the handle collapsed;
 * - at most {@link MAX_LABEL_SEGMENTS} segments are kept.
 *
 * Never throws: input that cannot be understood labels as `/`.
 */
export function normalizeRoute(rawUrl: string | null | undefined): string {
  if (!rawUrl) return '/';
  let path = rawUrl;

  // A full URL ("http://host/x?y") reduces to its path without invoking the URL
  // parser on the hot path: skip past "scheme://authority" by hand.
  const schemeEnd = path.indexOf('://');
  if (schemeEnd > 0 && schemeEnd < 12) {
    const slash = path.indexOf('/', schemeEnd + 3);
    path = slash === -1 ? '/' : path.slice(slash);
  }

  const cut = path.search(/[?#]/);
  if (cut !== -1) path = path.slice(0, cut);

  const parts = path.split('/');
  const segments: string[] = [];
  for (const part of parts) if (part) segments.push(part);
  if (segments.length === 0) return '/';

  const lastExt = extensionOf(segments[segments.length - 1]);
  if (lastExt && STATIC_EXTENSIONS.has(lastExt)) return `static:${lastExt}`;

  const out: string[] = [];
  const keep = Math.min(segments.length, MAX_LABEL_SEGMENTS);
  for (let i = 0; i < keep; i++) {
    const seg = segments[i];
    if (seg.charCodeAt(0) === 64 /* @ */) out.push('@:id');
    else if (seg.includes('.') || isIdSegment(seg)) out.push(':id');
    else out.push(seg);
  }
  return `/${out.join('/')}`;
}

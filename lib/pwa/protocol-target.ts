/**
 * `web+rmh://…` protocol-handler resolution (OPT-64).
 *
 * The manifest registers `web+rmh` as a custom scheme pointing at
 * `/handle?target=%s`. That makes `target` the one input on this site that
 * arrives from **outside the browser** — an OS-level link, a QR code, a chat
 * client, anything that can put a URL on the system clipboard — with no
 * referrer, no same-origin story and no CSRF token to lean on. It is treated
 * accordingly: nothing here reflects the input, and nothing here can produce a
 * destination that is not a site-relative path this module wrote itself.
 *
 * The shape is `web+rmh://<kind>/<value>`:
 *
 *   web+rmh://game/altair      → /altair          (the game's own href)
 *   web+rmh://app/rmhtube      → /rmhtube
 *   web+rmh://user/rmh         → /u/rmh
 *   web+rmh://post/<id>        → /thread/<id>
 *   web+rmh://page/search      → /explore      (search lives on Explore)
 *
 * Three rules make that safe:
 *
 * 1. **Kinds are a closed set.** An unknown kind resolves to `null`, not to a
 *    "best effort" path built from the input.
 * 2. **Values are matched, not interpolated.** `game`/`app`/`page` resolve
 *    against a fixed table (the catalogs, and the page map below), so the
 *    attacker picks from a list rather than supplying a string. The two kinds
 *    that must accept a free value (`user`, `post`) are constrained to a
 *    character class that cannot express a path separator, a scheme or a host.
 * 3. **The result is re-checked.** {@link isInternalPath} runs on every branch's
 *    output. It is what stops `//evil.example` — a protocol-relative URL that
 *    passes a naive `startsWith('/')` test and sends the browser off-site — and
 *    it is why the catalog's off-site entries (a couple of apps point at
 *    Discord) fall back to an on-site index instead of being handed to a
 *    redirect.
 *
 * Kept out of the route file so it can be unit-tested without a request; see
 * `lib/__tests__/pwa-protocol-target.test.ts`.
 */

import { apps } from '@/lib/apps';
import { games } from '@/lib/games';

/** The custom scheme, as `URL#protocol` reports it. Must start with `web+`. */
export const PROTOCOL_SCHEME = 'web+rmh:';

/** Where an unresolvable target lands. Always internal, never the input. */
export const PROTOCOL_FALLBACK_PATH = '/';

/**
 * Longer than any legitimate target and short enough that a hostile one cannot
 * make the regexes below do real work.
 */
const MAX_TARGET_LENGTH = 512;

/**
 * C0 controls and DEL. A newline reaching a `Location` header is header
 * injection; the rest have no business in a path either.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** A user id or handle. No `/`, no `:`, no `%` — so no path, scheme or escape. */
const USER_SEGMENT = /^[A-Za-z0-9_.-]{1,40}$/;

/** A post/thread id (cuid today, possibly a ULID later). Same reasoning. */
const POST_SEGMENT = /^[A-Za-z0-9_-]{6,64}$/;

/** Static destinations reachable by name, so `page` never interpolates. */
const PAGES: Readonly<Record<string, string>> = {
  home: '/',
  feed: '/',
  explore: '/explore',
  // Both names resolve to the one page: Explore and Search were merged, and
  // an OS-level link authored against either spelling should still work.
  search: '/explore',
  games: '/games',
  apps: '/apps',
  daily: '/daily',
  notifications: '/notifications',
  messages: '/messages',
  wallet: '/wallet',
  settings: '/settings',
};

/**
 * True only for a path this app can navigate to on its own origin.
 *
 * `//host` and `/\host` are the two forms that look relative and are not: both
 * are read as protocol-relative URLs by browsers, which is the classic open
 * redirect. Backslashes are rejected outright rather than normalised.
 */
export function isInternalPath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_TARGET_LENGTH) return false;
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (path.includes('\\')) return false;
  if (CONTROL_CHARS.test(path)) return false;
  return true;
}

/** The catalog href for an entry, but only when it stays on this site. */
function internalHref(href: string | undefined, fallback: string): string {
  return href && isInternalPath(href) ? href : fallback;
}

/**
 * Split `web+rmh://kind/value` into its segments.
 *
 * Both the authority form (`web+rmh://game/altair`) and the opaque form
 * (`web+rmh:game/altair`) are accepted — which one an OS hands over depends on
 * how the link was authored, and rejecting half of them would just look broken.
 * `URL` does the dot-segment normalisation, so `../` can never survive into a
 * segment; percent-escapes are decoded here so the validation below sees the
 * real characters rather than `%2F`.
 */
function segmentsOf(target: string): string[] | null {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  if (url.protocol.toLowerCase() !== PROTOCOL_SCHEME) return null;

  const raw = [url.hostname, ...url.pathname.split('/')].filter(Boolean);
  const decoded: string[] = [];
  for (const part of raw) {
    try {
      decoded.push(decodeURIComponent(part));
    } catch {
      // Malformed escape — refuse the whole target rather than guess.
      return null;
    }
  }
  return decoded;
}

/**
 * Resolve a protocol target to a site-relative path, or `null` when it names
 * nothing this app knows about.
 *
 * Callers redirect to {@link PROTOCOL_FALLBACK_PATH} on `null`; landing on the
 * feed is a better answer than an error page for something the user launched
 * from their operating system.
 */
export function resolveProtocolTarget(target: unknown): string | null {
  if (typeof target !== 'string') return null;
  if (target.length === 0 || target.length > MAX_TARGET_LENGTH) return null;
  if (CONTROL_CHARS.test(target)) return null;

  const segments = segmentsOf(target);
  if (!segments || segments.length < 1) return null;

  const kind = segments[0].toLowerCase();
  const value = segments[1] ?? '';
  let path: string | null = null;

  switch (kind) {
    case 'game': {
      const game = games.find((g) => g.id === value.toLowerCase());
      if (game) path = internalHref(game.href, `/games/${game.id}`);
      break;
    }
    case 'app': {
      const app = apps.find((a) => a.id === value.toLowerCase());
      // A couple of catalog apps point off-site (Discord). Those resolve to the
      // apps index: a protocol handler must never be a way to bounce a user to
      // another origin, however well-known that origin is.
      if (app) path = internalHref(app.href, '/apps');
      break;
    }
    case 'user':
    case 'u': {
      // `@handle` is how the site writes a mention, so accept it and drop the @.
      const handle = value.startsWith('@') ? value.slice(1) : value;
      if (USER_SEGMENT.test(handle)) path = `/u/${handle}`;
      break;
    }
    case 'post':
    case 'thread': {
      if (POST_SEGMENT.test(value)) path = `/thread/${value}`;
      break;
    }
    case 'page': {
      path = PAGES[value.toLowerCase()] ?? null;
      break;
    }
    default:
      path = null;
  }

  // The last word on every branch, including the ones built from the catalog.
  return path && isInternalPath(path) ? path : null;
}

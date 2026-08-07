/**
 * Direct lobby links — the shareable half of a join code.
 *
 * A code is fine to read out loud and miserable to type on a phone, and every
 * multiplayer game here had exactly one way in: copy six characters, paste them
 * into a chat, and hope the other person types them back correctly. This module
 * is the other way in — an ordinary URL that carries the code in `?lobby=`, so
 * opening it lands on the game already joining.
 *
 * Two shapes exist because two shapes already existed:
 *
 *   - **Query** (`/gabriels-horn?lobby=AB12CD`) for the games whose lobby is a
 *     screen inside a single route. {@link lobbyLink}.
 *   - **Path** (`/rmhbox/AB12CD`) for the two games whose lobby already IS a
 *     route — RMHbox and Altair. Those links work on their own; they only ever
 *     needed a button that hands them out. {@link lobbyPathLink}.
 *
 * Codes are never re-cased here. Most games uppercase theirs, Neon Driftway
 * mints `ndw-<base36>`, and a link that helpfully shouted the code back would
 * simply fail to join that one game. Casing belongs to the game.
 */

/** The search param every query-shaped invite link uses. */
export const LOBBY_LINK_PARAM = 'lobby';

/**
 * Codes across the games are 4–8 alphanumerics, except Neon Driftway's
 * hyphenated room ids. Anything else in the slot is not a code that could join
 * anything, so it is rejected rather than passed to a socket.
 */
const LOBBY_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/;

/**
 * A code from an untrusted place (a URL, a paste) as something joinable, or
 * `null`. Whitespace is forgiving because links get wrapped by mail clients.
 */
export function sanitizeLobbyCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim();
  return LOBBY_CODE_PATTERN.test(code) ? code : null;
}

/** The origin to build links against, or `''` during SSR. */
function origin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

/**
 * `https://rmhstudios.com/laundry-sort?lobby=AB12CD` — an absolute invite link
 * for a game whose lobby is a screen. `path` defaults to the current page,
 * which is what a lobby rendered on its game's own route wants.
 *
 * Returns `''` when there is no `window` (SSR), so a caller that renders the
 * link renders nothing rather than a half-formed URL.
 */
export function lobbyLink(code: string, path?: string): string {
  const base = origin();
  if (!base) return '';
  const url = new URL(path ?? window.location.pathname, base);
  url.searchParams.set(LOBBY_LINK_PARAM, code);
  return url.toString();
}

/**
 * `https://rmhstudios.com/rmhbox/AB12CD` — an absolute link for a game whose
 * lobby is already its own route, so the code lives in the path.
 */
export function lobbyPathLink(path: string): string {
  const base = origin();
  return base ? new URL(path, base).toString() : '';
}

/**
 * Where to send somebody back to after a detour, keeping the invite intact —
 * `/massive-march?lobby=AB12CD`, or just `/massive-march` when there is no
 * invite in play.
 *
 * The games that require an account send signed-out visitors to `/login` with a
 * callback path, and an invite link is most often opened by exactly that
 * person: a friend who is not signed in. Dropping the code on the way through
 * login is dropping the invitation.
 */
export function lobbyReturnPath(path: string, code?: string | null): string {
  return code ? `${path}?${LOBBY_LINK_PARAM}=${encodeURIComponent(code)}` : path;
}

/**
 * The invite code in a query string, for code that has no router to ask —
 * Velum 2099's lobby overlay is plain DOM, built long before this.
 */
export function readLobbyCodeFromSearch(search: string = typeof window === 'undefined' ? '' : window.location.search): string | null {
  if (!search) return null;
  return sanitizeLobbyCode(new URLSearchParams(search).get(LOBBY_LINK_PARAM));
}

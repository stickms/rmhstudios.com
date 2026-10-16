/**
 * Handicaps (E9) — pure. An Elo gap becomes a small start-state advantage for
 * the lower-rated player in an UNRANKED friendly challenge. Nothing here is
 * ever read by the ranked engine or a leaderboard: a handicapped run is marked
 * by the `?handicap=` launch parameter and games that honour it skip their
 * leaderboard/progression writes.
 *
 * Games with a start-state hook (the only ones offered a handicap):
 *   - void-breaker: extra starting max HP (`hp`)
 */

export const HANDICAP_PARAM = 'handicap';

export interface HandicapHook {
  kind: 'hp';
  /** Largest advantage the hook will grant. */
  max: number;
  /** Game route the handicapped player launches. */
  href: string;
}

export const HANDICAP_HOOKS: Readonly<Record<string, HandicapHook>> = {
  'void-breaker': { kind: 'hp', max: 3, href: '/void-breaker' },
};

/** Gaps under this are an even match. */
export const HANDICAP_MIN_GAP = 100;
/** Elo points per extra step beyond the minimum gap. */
export const HANDICAP_STEP = 150;

export interface Handicap {
  kind: HandicapHook['kind'];
  amount: number;
  /** 'a' or 'b' — the lower-rated side, who receives the advantage. */
  to: 'a' | 'b';
  gap: number;
}

export function handicapFor(game: string, ratingA: number, ratingB: number): Handicap | null {
  const hook = HANDICAP_HOOKS[game];
  if (!hook) return null;
  const gap = Math.abs(ratingA - ratingB);
  if (gap < HANDICAP_MIN_GAP) return null;
  const amount = Math.min(hook.max, 1 + Math.floor((gap - HANDICAP_MIN_GAP) / HANDICAP_STEP));
  return { kind: hook.kind, amount, to: ratingA < ratingB ? 'a' : 'b', gap };
}

export function handicapLaunchUrl(game: string, kind: string, amount: number): string | null {
  const hook = HANDICAP_HOOKS[game];
  return hook ? `${hook.href}?${HANDICAP_PARAM}=${kind}:${amount}` : null;
}

/** A start-state advantage from a launch query string, or null. Clamped to the hook's max. */
export function parseHandicap(
  game: string,
  search: string = typeof window === 'undefined' ? '' : window.location.search,
): { kind: 'hp'; amount: number } | null {
  const hook = HANDICAP_HOOKS[game];
  const raw = new URLSearchParams(search).get(HANDICAP_PARAM);
  if (!hook || !raw) return null;
  const [kind, n] = raw.split(':');
  const amount = Math.trunc(Number(n));
  if (kind !== hook.kind || !Number.isFinite(amount) || amount < 1) return null;
  return { kind: hook.kind, amount: Math.min(amount, hook.max) };
}

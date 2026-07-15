// Client-safe registry of games that can back a coin-staked wager match or a
// tournament. This is intentionally a small, curated allowlist rather than a
// flag on every `GameInfo` — most games in `lib/games.ts` have no head-to-head
// "winner" outcome, and RMHType lives in `lib/apps.ts`, not the games catalog.
//
// `authoritative: true` means the game reports a server-validated result to
// `/api/internal/match-result` (the winner cannot be forged). Non-authoritative
// games settle via dual-confirmation (both players agree) or admin adjudication
// — coin stakes are still allowed, but the trust model is weaker, so the UI
// labels them accordingly.

export interface WagerEligibleGame {
  /** Stable id — matches `GameInfo.id` / app id and is stored on the match. */
  id: string;
  title: string;
  /** Route to launch the game. */
  href: string;
  /** Whether the game's hub reports an authoritative server-validated winner. */
  authoritative: boolean;
}

export const WAGER_ELIGIBLE_GAMES: readonly WagerEligibleGame[] = [
  { id: 'rmhtype', title: 'RMHType', href: '/rmhtype', authoritative: true },
  { id: 'slice-it', title: 'Slice It!', href: '/slice-it', authoritative: false },
  {
    id: 'kowloon-knockout',
    title: 'Kowloon Knockout',
    href: '/kowloon-knockout',
    authoritative: false,
  },
  { id: 'void-breaker', title: 'Void Breaker', href: '/void-breaker', authoritative: false },
  { id: 'synapse-storm', title: 'Synapse Storm', href: '/synapse-storm', authoritative: false },
  { id: 'neon-driftway', title: 'Neon Driftway', href: '/neon-driftway', authoritative: false },
] as const;

const BY_ID = new Map(WAGER_ELIGIBLE_GAMES.map((g) => [g.id, g]));

export function getWagerGame(id: string): WagerEligibleGame | undefined {
  return BY_ID.get(id);
}

export function isWagerEligible(id: string): boolean {
  return BY_ID.has(id);
}

/** The ids allowed by the zod schemas (kept in sync with the registry). */
export const WAGER_ELIGIBLE_GAME_IDS = WAGER_ELIGIBLE_GAMES.map((g) => g.id) as [
  string,
  ...string[],
];

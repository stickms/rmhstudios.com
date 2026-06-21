/**
 * Standard ELO rating math (#5). Pure functions, K-factor 32.
 */

export const K_FACTOR = 32;
export const BASE_RATING = 1000;

/** Expected score for player A against player B. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * New rating for a player given their score (1 win, 0.5 draw, 0 loss) against
 * an opponent of `opponentRating`.
 */
export function nextRating(rating: number, opponentRating: number, score: number): number {
  return Math.round(rating + K_FACTOR * (score - expectedScore(rating, opponentRating)));
}

/** Curated list of games that support ranked challenges. */
export const RANKED_GAMES: { id: string; name: string }[] = [
  { id: 'altair', name: 'Altair' },
  { id: 'rmhbox', name: 'RMHBox' },
  { id: 'signal-forge', name: 'Signal Forge' },
  { id: 'vega', name: 'Vega' },
  { id: 'void-breaker', name: 'Void Breaker' },
  { id: 'neon-driftway', name: 'Neon Driftway' },
  { id: 'dream-rift', name: 'Dream Rift' },
  { id: 'laundry-sort', name: 'Laundry Sort' },
  { id: 'synapse-storm', name: 'Synapse Storm' },
];

export function isRankedGame(id: string): boolean {
  return RANKED_GAMES.some((g) => g.id === id);
}

export function gameName(id: string): string {
  return RANKED_GAMES.find((g) => g.id === id)?.name ?? id;
}

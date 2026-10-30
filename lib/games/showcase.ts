/**
 * Profile showcases as pure rules: which achievements and badges a member may feature
 * (only ones they own, at most six of each, in the order chosen). Client-safe.
 */

export const MAX_SHOWCASE = 6;

export const badgeKey = (gameId: string, foil: boolean) => `${gameId}:${foil ? 'foil' : 'normal'}`;

export function parseBadgeKey(key: string): { gameId: string; foil: boolean } | null {
  const i = key.lastIndexOf(':');
  if (i <= 0) return null;
  const kind = key.slice(i + 1);
  if (kind !== 'foil' && kind !== 'normal') return null;
  return { gameId: key.slice(0, i), foil: kind === 'foil' };
}

function pick(input: unknown[], owned: Set<string>): string[] {
  const out: string[] = [];
  for (const x of input) {
    if (typeof x !== 'string' || !owned.has(x) || out.includes(x)) continue;
    out.push(x);
    if (out.length === MAX_SHOWCASE) break;
  }
  return out;
}

export function cleanShowcase(
  input: { achievements: unknown[]; badges: unknown[] },
  owned: { achievements: Set<string>; badges: Set<string> },
): { achievements: string[]; badges: string[] } {
  return { achievements: pick(input.achievements, owned.achievements), badges: pick(input.badges, owned.badges) };
}

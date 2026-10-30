/**
 * The games section of Wrapped: time played over the year, the titles behind it, and the
 * cards and badges that came with it. Pure and client-safe. It is deliberately NOT part of
 * `WrappedStats`: that shape is the fixed, reviewable set of facts the narrative model may
 * see, and this stays out of it.
 */

export type PlaySummary = {
  seconds: number;
  titles: number;
  top: { gameId: string; title: string; seconds: number }[];
  cardDrops: number;
  badges: number;
};

export function summarizePlay(
  rows: readonly { gameId: string; seconds: number }[],
  titleNames: ReadonlyMap<string, string>,
  extras: { cardDrops: number; badges: number },
): PlaySummary | null {
  const per = new Map<string, number>();
  for (const r of rows) {
    if (!titleNames.has(r.gameId) || !(r.seconds > 0)) continue;
    per.set(r.gameId, (per.get(r.gameId) ?? 0) + r.seconds);
  }
  const seconds = [...per.values()].reduce((n, s) => n + s, 0);
  if (seconds === 0 && extras.cardDrops === 0 && extras.badges === 0) return null;
  const top = [...per.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([gameId, s]) => ({ gameId, title: titleNames.get(gameId) as string, seconds: s }));
  return { seconds, titles: per.size, top, cardDrops: extras.cardDrops, badges: extras.badges };
}

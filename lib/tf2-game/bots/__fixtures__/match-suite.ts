/**
 * TEST SUPPORT ONLY: the per-map assertions of the headless bot matches
 * (bots.match.*.maps.test.ts) — 12v12 TFBots for five minutes of game time,
 * run as fast as the machine goes.
 */
import { expect } from 'vitest';
import { CLASS_NAMES, TF_CLASS_COUNT } from '../../core/constants';
import { runBotMatch, type MatchResult } from './maps';

export const MATCH_MINUTES = 5;
/** A bot "moves" when it covers more than this per minute. */
export const MOVE_PER_MINUTE = 500;

export function describeResult(r: MatchResult): string {
  const kills = CLASS_NAMES.map((c, i) => (i ? `${c} ${r.kills[i]}` : ''))
    .filter(Boolean)
    .join(', ');
  const moving = r.movedPerMinute.filter((d) => d > MOVE_PER_MINUTE).length;
  return (
    `[match] ${r.map}: ${r.msPerTick.toFixed(2)} ms/tick (bots ${r.brainMsPerTick.toFixed(2)} ms, worst ${r.worstTickMs.toFixed(0)} ms); ` +
    `rounds RED ${r.teamScores[0]} BLU ${r.teamScores[1]}, intel RED ${r.flagCaptures[0]} BLU ${r.flagCaptures[1]}; ` +
    `captures ${r.captures.length} [${r.captures.join(' ')}]; flags ${JSON.stringify(r.flagEvents)}; cart ${(r.cartProgress * 100).toFixed(0)} %; ` +
    `kills ${r.kills.reduce((a, b) => a + b, 0)} (${kills}); moving ${moving}/${r.movedPerMinute.length}`
  );
}

/** Runs one map's match, records it in `results` (for the class tally) and checks it. */
export function playAndCheck(map: string, results: MatchResult[], seed?: number): MatchResult {
  const r = runBotMatch(map, { minutes: MATCH_MINUTES, seed });
  r.host.dispose();
  results.push(r);
  // eslint-disable-next-line no-console
  console.log(describeResult(r));
  // The objective moves.
  if (map.startsWith('ctf_')) expect(r.flagEvents.pickup ?? 0).toBeGreaterThan(0);
  else if (map.startsWith('pl_')) expect(r.cartProgress > 0.05 || r.captures.length > 0).toBe(true);
  else expect(r.captures.length).toBeGreaterThan(0);
  // People die.
  expect(r.kills.reduce((a, b) => a + b, 0)).toBeGreaterThan(20);
  // Nobody is NaN or stuck forever.
  expect(r.nonFinite).toBe(0);
  const moving = r.movedPerMinute.filter((d) => d > MOVE_PER_MINUTE).length;
  expect(moving).toBeGreaterThanOrEqual(Math.ceil(r.movedPerMinute.length * 0.9));
  // The bots' share of a tick (their think()), 24 of them.
  expect(r.brainMsPerTick).toBeLessThan(4);
  return r;
}

/** Kills per class summed over a file's maps. */
export function tallyKills(results: readonly MatchResult[]): number[] {
  const out = new Array<number>(TF_CLASS_COUNT).fill(0);
  for (const r of results) for (let c = 1; c < TF_CLASS_COUNT; c++) out[c] += r.kills[c];
  return out;
}

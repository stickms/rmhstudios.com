/**
 * Headless bot matches on the nine hosted maps (needs TF2_ROOT): 12v12
 * TFBots at normal difficulty for five minutes of game time each, run as
 * fast as the machine goes. Per map: the objective moves (intel pickups,
 * captures, the cart), kills happen, nobody goes NaN, more than 90 % of the
 * bots keep moving, and the bots' think() costs under 4 ms a tick for all
 * 24. Over the nine maps every class scores kills.
 *
 * The suite takes ~15 minutes (the simulation runs through Vitest's module
 * transform, about twice as slow as the bundled hub worker).
 */
import { describe, expect, it } from 'vitest';
import { CLASS_NAMES, TF_CLASS_COUNT } from '../core/constants';
import type { MatchResult } from './__fixtures__/maps';
import { BOT_MAPS, TF2_ROOT } from './__fixtures__/maps';
import { playAndCheck, tallyKills } from './__fixtures__/match-suite';

describe.skipIf(!TF2_ROOT)('bot matches on the hosted maps', () => {
  const results: MatchResult[] = [];

  it.each(BOT_MAPS)(
    '%s: 12v12 bots for five minutes',
    (map) => {
      playAndCheck(map, results);
    },
    900_000,
  );

  it('every class scores kills over the nine maps', () => {
    expect(results.length).toBe(BOT_MAPS.length);
    const kills = tallyKills(results);
    const avg = results.reduce((s, r) => s + r.msPerTick, 0) / results.length;
    const bots = results.reduce((s, r) => s + r.brainMsPerTick, 0) / results.length;
    // eslint-disable-next-line no-console
    console.log(
      `[match] all maps: ${avg.toFixed(2)} ms/tick average (bots ${bots.toFixed(2)} ms); kills ${CLASS_NAMES.map(
        (c, i) => (i ? `${c} ${kills[i]}` : ''),
      )
        .filter(Boolean)
        .join(', ')}`,
    );
    const missing: string[] = [];
    for (let c = 1; c < TF_CLASS_COUNT; c++) if (kills[c] === 0) missing.push(CLASS_NAMES[c]);
    expect(missing).toEqual([]);
  });
});

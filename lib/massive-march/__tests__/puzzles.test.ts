import { describe, expect, it } from 'vitest';

import { WORLD_VARIANTS, type WorldVariant } from '../constants';
import {
  act,
  activeCount,
  activePads,
  activeTotems,
  createRuntime,
  lockReason,
  evaluate,
  restoreRuntimes,
  revealFor,
  isHardLock,
  scoreHoop,
  statusOf,
  type PuzzleContext,
  type PuzzlePlayer,
  type PuzzleRuntime,
} from '../puzzles';
import {
  PUZZLE_SITES,
  puzzleSite,
  TOTAL_ORBS,
  TOTAL_THRESHOLD,
  type KeyId,
  type PuzzleSite,
  type SymbolId,
} from '../world/sites';

/**
 * The puzzle engine, played through.
 *
 * Every installation is exercised end to end here without a socket, which is the
 * point of keeping the engine pure. The tests that matter most are the negative
 * ones: pressing a button you are not standing next to, digging where nothing is
 * buried, and — above all — asking for a reveal you have not earned. Those are
 * the cases where a regression would not look like a bug, it would look like the
 * game being easy.
 */

const SEED = 0xbeef;

function site(id: string): PuzzleSite {
  const found = puzzleSite(id);
  if (!found) throw new Error(`no site ${id}`);
  return found;
}

function ctx(players: PuzzlePlayer[], overrides: Partial<PuzzleContext> = {}): PuzzleContext {
  return {
    now: 1_000_000,
    variant: 'duo',
    keys: new Set(['yellow', 'blue', 'red']),
    night: true,
    players,
    ...overrides,
  };
}

function at(slot: number, x: number, z: number, extra: Partial<PuzzlePlayer> = {}): PuzzlePlayer {
  return { slot, x, z, blinded: false, hasFinder: false, ...extra };
}

function actor(player: PuzzlePlayer) {
  return { ...player, name: `P${player.slot}` };
}

function runtimeFor(id: string, variant: WorldVariant = 'duo'): PuzzleRuntime {
  return createRuntime(site(id), SEED, variant);
}

describe('pressure pads', () => {
  const bells = site('tide-bells');

  it('needs a distinct person on every lit pad', () => {
    const pads = activePads(bells, 'duo');
    const runtime = runtimeFor('tide-bells');

    // One person cannot cover two pads, even if they overlap.
    const alone = ctx([at(0, pads[0].x, pads[0].z)]);
    expect(evaluate(bells, runtime, alone).solved).toBe(false);

    const both = [at(0, pads[0].x, pads[0].z), at(1, pads[1].x, pads[1].z)];
    // First tick starts the hold; the pads have to STAY held.
    expect(evaluate(bells, runtime, ctx(both)).solved).toBe(false);
    const later = ctx(both, { now: 1_000_000 + 600 });
    expect(evaluate(bells, runtime, later).solved).toBe(true);
    expect(runtime.solved).toBe(true);
  });

  it('starts the hold over when somebody steps off', () => {
    const pads = activePads(bells, 'duo');
    const runtime = runtimeFor('tide-bells');
    const both = [at(0, pads[0].x, pads[0].z), at(1, pads[1].x, pads[1].z)];
    evaluate(bells, runtime, ctx(both));
    // Player 1 wanders off.
    evaluate(bells, runtime, ctx([both[0], at(1, 0, 0)], { now: 1_000_300 }));
    expect(runtime.padHoldSince).toBeNull();
    // Back on, but the clock restarts — a run-through does not count.
    evaluate(bells, runtime, ctx(both, { now: 1_000_400 }));
    expect(evaluate(bells, runtime, ctx(both, { now: 1_000_500 })).solved).toBe(false);
  });

  it('lights more pads for a bigger world', () => {
    expect(activePads(bells, 'band').length).toBeGreaterThan(activePads(bells, 'duo').length);
  });
});

describe('the sealed booth', () => {
  const booth = site('sealed-booth');

  it('shows the sequence to somebody inside and to nobody else', () => {
    const runtime = runtimeFor('sealed-booth');
    const inside = at(0, booth.booths![0].x, booth.booths![0].z);
    const outside = at(1, booth.console!.x, booth.console!.z);
    const world = ctx([inside, outside]);

    const revealed = revealFor(booth, runtime, world, inside);
    expect(revealed?.kind).toBe('booth');
    expect(revealFor(booth, runtime, world, outside)).toBeNull();
  });

  it('accepts the sequence in order and resets on a wrong mark', () => {
    const runtime = runtimeFor('sealed-booth');
    const operator = at(1, booth.console!.x, booth.console!.z);
    const world = ctx([operator]);
    const sequence = [...runtime.sequence];

    const wrong = runtime.buttons.find((symbol) => symbol !== sequence[0]) as SymbolId;
    act(booth, runtime, world, actor(operator), { action: 'press', symbol: sequence[0] });
    expect(runtime.pressed).toHaveLength(1);
    act(booth, runtime, world, actor(operator), { action: 'press', symbol: wrong });
    expect(runtime.pressed).toHaveLength(0);

    for (const symbol of sequence) {
      act(booth, runtime, world, actor(operator), { action: 'press', symbol });
    }
    expect(runtime.solved).toBe(true);
  });

  it('refuses a press from somebody who is not at the console', () => {
    const runtime = runtimeFor('sealed-booth');
    const faraway = at(0, booth.x + 200, booth.z);
    const result = act(booth, runtime, ctx([faraway]), actor(faraway), {
      action: 'press',
      symbol: runtime.sequence[0],
    });
    expect(result.rejected).toBe('too-far');
    expect(runtime.pressed).toHaveLength(0);
  });

  it('refuses a press from somebody wearing the bucket', () => {
    const runtime = runtimeFor('sealed-booth');
    const blinded = at(0, booth.console!.x, booth.console!.z, { blinded: true });
    expect(
      act(booth, runtime, ctx([blinded]), actor(blinded), {
        action: 'press',
        symbol: runtime.sequence[0],
      }).rejected,
    ).toBe('blinded');
  });

  it('splits the sequence across two booths so neither half is the answer', () => {
    const split = site('split-glass');
    const runtime = runtimeFor('split-glass');
    const left = at(0, split.booths![0].x, split.booths![0].z);
    const right = at(1, split.booths![1].x, split.booths![1].z);
    const world = ctx([left, right]);

    const a = revealFor(split, runtime, world, left);
    const b = revealFor(split, runtime, world, right);
    expect(a?.kind).toBe('booth');
    expect(b?.kind).toBe('booth');
    if (a?.kind !== 'booth' || b?.kind !== 'booth') return;
    expect(a.symbols.length + b.symbols.length).toBe(runtime.sequence.length);
    expect(a.offset).not.toBe(b.offset);
  });
});

describe('the bucket walk', () => {
  const walk = site('bucket-walk');

  it('tells the guides the next plate and never tells the wearer', () => {
    const runtime = runtimeFor('bucket-walk');
    const wearer = at(0, walk.x, walk.z, { blinded: true });
    const guide = at(1, walk.x + 4, walk.z);
    const world = ctx([wearer, guide]);

    evaluate(walk, runtime, world);
    expect(revealFor(walk, runtime, world, guide)?.kind).toBe('plate');
    expect(revealFor(walk, runtime, world, wearer)).toBeNull();
  });

  it('advances through the plates in order and resets on a wrong one', () => {
    const runtime = runtimeFor('bucket-walk');
    const plates = walk.plates!;
    const order = runtime.order;
    const guide = at(1, walk.x + 4, walk.z);

    const stepOn = (index: number) => {
      const plate = plates[index];
      const wearer = at(0, plate.x, plate.z, { blinded: true });
      return evaluate(walk, runtime, ctx([wearer, guide]));
    };

    // Somebody has to be wearing it before anything happens at all.
    evaluate(walk, runtime, ctx([at(0, walk.x, walk.z), guide]));
    expect(runtime.wearer).toBeNull();

    stepOn(order[0]);
    expect(runtime.plateIndex).toBe(1);

    // A plate further along the route is a wrong turn, not a shortcut.
    const wrongIndex = order[3];
    const reset = stepOn(wrongIndex);
    expect(runtime.plateIndex).toBe(0);
    expect(reset.events.some((event) => event.kind === 'reset')).toBe(true);

    for (const index of order) stepOn(index);
    expect(runtime.solved).toBe(true);
  });

  it('forgets the route when the bucket comes off', () => {
    const runtime = runtimeFor('bucket-walk');
    const plates = walk.plates!;
    const guide = at(1, walk.x + 4, walk.z);
    evaluate(
      walk,
      runtime,
      ctx([at(0, plates[runtime.order[0]].x, plates[runtime.order[0]].z, { blinded: true }), guide]),
    );
    expect(runtime.plateIndex).toBe(1);
    evaluate(walk, runtime, ctx([at(0, walk.x, walk.z), guide]));
    expect(runtime.plateIndex).toBe(0);
  });
});

describe('the totems', () => {
  const totems = site('three-totems');

  it('shows the target only from the lookout', () => {
    const runtime = runtimeFor('three-totems');
    const onLookout = at(0, totems.lookout!.x, totems.lookout!.z);
    const atTotem = at(1, totems.totems![0].x, totems.totems![0].z);
    const world = ctx([onLookout, atTotem]);

    expect(revealFor(totems, runtime, world, onLookout)?.kind).toBe('totems');
    expect(revealFor(totems, runtime, world, atTotem)).toBeNull();
  });

  it('turns one eighth at a time and completes when they all match', () => {
    const runtime = runtimeFor('three-totems');
    const active = activeTotems(totems, 'duo');
    const world = ctx([at(0, 0, 0)], { variant: 'duo' });

    for (let i = 0; i < active.length; i++) {
      const spot = active[i];
      const operator = at(0, spot.x, spot.z);
      let guard = 0;
      while (runtime.facings[i] !== runtime.target[i] && guard < 10) {
        act(totems, runtime, ctx([operator], { variant: 'duo' }), actor(operator), {
          action: 'turn',
          totem: spot.id,
        });
        guard++;
      }
      expect(runtime.facings[i]).toBe(runtime.target[i]);
    }
    expect(runtime.solved).toBe(true);
    void world;
  });

  it('will not let you turn a totem from across the island', () => {
    const runtime = runtimeFor('three-totems');
    const faraway = at(0, totems.x + 400, totems.z);
    expect(
      act(totems, runtime, ctx([faraway]), actor(faraway), {
        action: 'turn',
        totem: totems.totems![0].id,
      }).rejected,
    ).toBe('too-far');
  });
});

describe('the hunt', () => {
  const hunt = site('scatter-cairns');

  it('reads a distance only for whoever is holding the finder', () => {
    const runtime = runtimeFor('scatter-cairns');
    const holder = at(0, hunt.x, hunt.z, { hasFinder: true });
    const other = at(1, hunt.x, hunt.z);
    const world = ctx([holder, other]);
    expect(revealFor(hunt, runtime, world, holder)?.kind).toBe('finder');
    expect(revealFor(hunt, runtime, world, other)).toBeNull();
  });

  it('digs up a marker you are standing on and nothing where there is none', () => {
    const runtime = runtimeFor('scatter-cairns');
    expect(runtime.markers.length).toBeGreaterThan(0);

    const empty = at(0, hunt.x + 500, hunt.z + 500);
    expect(act(hunt, runtime, ctx([empty]), actor(empty), { action: 'dig' }).rejected).toBe(
      'nothing-here',
    );

    for (const marker of [...runtime.markers]) {
      const digger = at(0, marker.x, marker.z);
      act(hunt, runtime, ctx([digger]), actor(digger), { action: 'dig' });
    }
    expect(runtime.markers.every((marker) => marker.found)).toBe(true);
    expect(runtime.solved).toBe(true);
  });

  it('buries more of them in a bigger world', () => {
    expect(runtimeFor('scatter-cairns', 'band').markers.length).toBeGreaterThan(
      runtimeFor('scatter-cairns', 'duo').markers.length,
    );
  });
});

describe('the hoop', () => {
  it('takes three passes', () => {
    const hoop = site('hoop-and-ball');
    const runtime = runtimeFor('hoop-and-ball');
    expect(scoreHoop(hoop, runtime).solved).toBe(false);
    expect(scoreHoop(hoop, runtime).solved).toBe(false);
    expect(scoreHoop(hoop, runtime).solved).toBe(true);
  });
});

describe('the final march', () => {
  const final = site('final-march');

  it('runs read, then turn, then stand — and refuses them out of order', () => {
    const runtime = runtimeFor('final-march');
    const operator = at(0, final.console!.x, final.console!.z);
    const totem = final.totems![0];
    const atTotem = at(0, totem.x, totem.z);

    // Turning is not available while the sequence is still being read.
    expect(
      act(final, runtime, ctx([atTotem]), actor(atTotem), { action: 'turn', totem: totem.id })
        .rejected,
    ).toBe('wrong-stage');

    for (const symbol of [...runtime.sequence]) {
      act(final, runtime, ctx([operator]), actor(operator), { action: 'press', symbol });
    }
    expect(runtime.stage).toBe(1);
    expect(runtime.solved).toBe(false);

    const active = activeTotems(final, 'duo');
    for (let i = 0; i < active.length; i++) {
      const spot = active[i];
      const person = at(0, spot.x, spot.z);
      let guard = 0;
      while (runtime.facings[i] !== runtime.target[i] && guard < 10) {
        act(final, runtime, ctx([person], { variant: 'duo' }), actor(person), {
          action: 'turn',
          totem: spot.id,
        });
        guard++;
      }
    }
    expect(runtime.stage).toBe(2);

    const pads = activePads(final, 'duo');
    const standing = pads.map((pad, index) => at(index, pad.x, pad.z));
    evaluate(final, runtime, ctx(standing, { variant: 'duo' }));
    const done = evaluate(final, runtime, ctx(standing, { variant: 'duo', now: 1_000_600 }));
    expect(done.solved).toBe(true);
  });
});

describe('gating', () => {
  it('will not run a keyed site before its tower has been fed', () => {
    const totems = site('three-totems');
    const runtime = runtimeFor('three-totems');
    const world = ctx([at(0, totems.totems![0].x, totems.totems![0].z)], { keys: new Set() });
    expect(statusOf(totems, runtime, world).lockedBy).toBe('key');
    expect(
      act(totems, runtime, world, actor(world.players[0]), {
        action: 'turn',
        totem: totems.totems![0].id,
      }).rejected,
    ).toBe('key');
  });

  it('will not run a night site in daylight', () => {
    const lamps = site('night-lamps');
    const runtime = runtimeFor('night-lamps');
    const pads = activePads(lamps, 'duo');
    const world = ctx(pads.map((pad, index) => at(index, pad.x, pad.z)), { night: false });
    expect(statusOf(lamps, runtime, world).lockedBy).toBe('night');
    expect(evaluate(lamps, runtime, world).solved).toBe(false);
  });

  it('says so when there are more pads than people', () => {
    const relay = site('long-relay');
    const runtime = runtimeFor('long-relay', 'band');
    const world = ctx([at(0, relay.x, relay.z)], { variant: 'band' });
    expect(statusOf(relay, runtime, world).lockedBy).toBe('crew');
  });

  it('notices the first time anybody walks up to a site', () => {
    const bells = site('tide-bells');
    const runtime = runtimeFor('tide-bells');
    expect(runtime.discovered).toBe(false);
    const outcome = evaluate(bells, runtime, ctx([at(0, bells.x, bells.z)]));
    expect(runtime.discovered).toBe(true);
    expect(outcome.events.some((event) => event.kind === 'discovered')).toBe(true);
  });
});

describe('saves', () => {
  it('keeps what was finished and throws away what was half-entered', () => {
    const booth = site('sealed-booth');
    const runtime = runtimeFor('sealed-booth');
    const operator = at(0, booth.console!.x, booth.console!.z);
    act(booth, runtime, ctx([operator]), actor(operator), {
      action: 'press',
      symbol: runtime.sequence[0],
    });
    runtime.discovered = true;

    const bells = runtimeFor('tide-bells');
    bells.solved = true;

    const restored = restoreRuntimes(
      { 'sealed-booth': runtime, 'tide-bells': bells },
      SEED,
      'duo',
    );
    expect(restored['tide-bells'].solved).toBe(true);
    expect(restored['sealed-booth'].discovered).toBe(true);
    // A sequence half-entered a week ago is a trap, not progress.
    expect(restored['sealed-booth'].pressed).toHaveLength(0);
    // …but the sequence itself survives, so the answer has not changed.
    expect(restored['sealed-booth'].sequence).toEqual(runtime.sequence);
  });

  it('regenerates a site the save has never heard of', () => {
    const restored = restoreRuntimes({}, SEED, 'duo');
    expect(Object.keys(restored).length).toBeGreaterThan(10);
    expect(restored['final-march'].sequence.length).toBeGreaterThan(0);
  });

  it('produces the same island twice from the same seed, and a different one otherwise', () => {
    const a = createRuntime(site('sealed-booth'), 1234, 'duo');
    const b = createRuntime(site('sealed-booth'), 1234, 'duo');
    const c = createRuntime(site('sealed-booth'), 5678, 'duo');
    expect(a.sequence).toEqual(b.sequence);
    expect(a.sequence).not.toEqual(c.sequence);
  });
});

describe('hard locks versus advice', () => {
  /**
   * `key` and `night` are the site refusing to run. `crew` is the site telling
   * you something. The HUD used to treat all three the same and hide the
   * console, the totems and the dig button whenever ANY lock was set — so an
   * undersized group arriving at the Final March got the crew note with nothing
   * to press, even though reading the sequence and turning the totems are
   * one-person jobs the server accepts. The ending was unreachable from the UI.
   *
   * These pin the two apart. The one that matters is the last: whatever the HUD
   * uses to decide, it has to agree with what `act()` will actually do.
   */

  it('separates a refusal from a note', () => {
    expect(isHardLock('key')).toBe(true);
    expect(isHardLock('night')).toBe(true);
    expect(isHardLock('crew')).toBe(false);
    expect(isHardLock(null)).toBe(false);
  });

  it('still reports the crew note, because that is the useful half', () => {
    const final = site('final-march');
    const alone = [at(0, final.x, final.z)];
    const status = statusOf(final, createRuntime(final, SEED, 'band'), ctx(alone, { variant: 'band' }));
    expect(status.lockedBy).toBe('crew');
    // Advice, not a refusal: the site is live, so it is not in the locked state.
    expect(status.state).not.toBe('locked');
  });

  it('lets one person start the Final March that their crew is too small for', () => {
    const final = site('final-march');
    const runtime = createRuntime(final, SEED, 'band');
    const console_ = final.console!;
    const alone = [at(0, console_.x, console_.z)];
    const context = ctx(alone, { variant: 'band' });

    expect(statusOf(final, runtime, context).lockedBy).toBe('crew');

    // Stage 0 is one person at a console. The crew note must not stop it.
    for (const symbol of runtime.sequence) {
      const result = act(final, runtime, context, actor(alone[0]), {
        action: 'press',
        symbol,
      });
      expect(result.rejected).toBeUndefined();
    }
    expect(runtime.stage).toBe(1);
  });

  it('agrees with the server everywhere a lock can appear', () => {
    // The regression in one assertion: whatever the HUD gates on has to match
    // what `act()` does, for every site, variant and crew size.
    for (const target of PUZZLE_SITES) {
      if (!target.console) continue;
      for (const variant of WORLD_VARIANTS) {
        for (const crew of [1, 2, 3, 4, 5]) {
          const runtime = createRuntime(target, SEED, variant);
          const spot = target.console;
          const players = Array.from({ length: crew }, (_, i) => at(i, spot.x, spot.z));
          const context = ctx(players, { variant });
          const status = statusOf(target, runtime, context);

          const result = act(target, runtime, context, actor(players[0]), {
            action: 'press',
            symbol: runtime.sequence[0],
          });
          const serverRefused = result.rejected === 'key' || result.rejected === 'night';

          expect(
            isHardLock(status.lockedBy ?? null),
            `${target.id} / ${variant} / ${crew}p: HUD hides the controls but the server ${
              serverRefused ? 'also refuses' : 'ACCEPTS the press'
            }`,
          ).toBe(serverRefused);
        }
      }
    }
  });
});

describe('one person, the whole island', () => {
  /**
   * The floor used to be two, and a floor of two means most people who open the
   * game cannot play it: somebody arrives, finds a lobby that needs a second
   * human, and leaves — indistinguishable from the game not working.
   *
   * These pin the promise the solo variant makes. Not "there is a solo option"
   * — that is a menu entry — but that a single player can actually reach the
   * end: every site has a one-person layout, none of them silently needs a
   * body that is not there, and the island still produces enough red rounds to
   * satisfy every tower.
   */
  const soloCtx = (players: PuzzlePlayer[]): PuzzleContext => ({
    now: 1_000_000,
    variant: 'solo',
    keys: new Set<KeyId>(['yellow', 'blue', 'red']),
    night: true,
    players,
  });

  const alone = (x: number, z: number, extra: Partial<PuzzlePlayer> = {}): PuzzlePlayer => ({
    slot: 0,
    x,
    z,
    blinded: false,
    hasFinder: false,
    ...extra,
  });

  it('gives every site a one-person layout', () => {
    for (const site of PUZZLE_SITES) {
      expect(activeCount(site, 'solo'), `${site.id} has no solo layout`).toBeGreaterThan(0);
      expect(activeCount(site, 'solo')).toBeLessThanOrEqual(activeCount(site, 'duo'));
    }
  });

  it('never asks a lone player for a body that is not there', () => {
    // `crew` is advice rather than a hard lock, but a solo campaign that shows
    // "you need more people" on every site is a solo campaign in name only.
    const ctx = soloCtx([alone(0, 0)]);
    for (const site of PUZZLE_SITES) {
      const players = [alone(site.x, site.z)];
      expect(lockReason(site, { ...ctx, players }), `${site.id} wants a crew`).not.toBe('crew');
    }
  });

  it('lights exactly one pad, which one person can stand on', () => {
    const pads = PUZZLE_SITES.filter((s) => s.kind === 'pads');
    expect(pads.length).toBeGreaterThan(2);
    for (const site of pads) {
      const lit = activePads(site, 'solo');
      expect(lit.length, `${site.id}`).toBe(1);

      // Standing on it, held past the debounce, solves it — with one player.
      const runtime = createRuntime(site, 1234, 'solo');
      const here = [alone(lit[0].x, lit[0].z)];
      evaluate(site, runtime, { ...soloCtx(here), now: 1_000_000 });
      const outcome = evaluate(site, runtime, { ...soloCtx(here), now: 1_000_000 + 900 });
      expect(outcome.solved, `${site.id} unsolvable alone`).toBe(true);
    }
  });

  it('reads the bucket route to the person wearing it, and to nobody else', () => {
    const site = PUZZLE_SITES.find((s) => s.kind === 'blind')!;
    const runtime = createRuntime(site, 99, 'solo');
    const wearer = alone(site.x, site.z, { blinded: true });

    // Register the wearer, the way a server tick does.
    evaluate(site, runtime, soloCtx([wearer]));

    const solo = revealFor(site, runtime, soloCtx([wearer]), wearer);
    expect(solo?.kind).toBe('plate');
    // A bearing, because they cannot see — not a map.
    expect(solo && 'guide' in solo ? solo.guide : undefined).toBeDefined();

    // The same player in a duo campaign gets nothing: the asymmetry is the game.
    const duo = revealFor(site, runtime, { ...soloCtx([wearer]), variant: 'duo' }, wearer);
    expect(duo).toBeNull();
  });

  it('points the bearing at the plate rather than away from it', () => {
    const site = PUZZLE_SITES.find((s) => s.kind === 'blind')!;
    const runtime = createRuntime(site, 7, 'solo');
    const wearer = alone(site.x, site.z, { blinded: true });
    evaluate(site, runtime, soloCtx([wearer]));

    const reveal = revealFor(site, runtime, soloCtx([wearer]), wearer);
    if (reveal?.kind !== 'plate' || !reveal.guide) throw new Error('no guide');
    const plate = site.plates!.find((p) => p.id === reveal.plate)!;

    // Walk the compass point it gave us and we should end up closer, not further.
    const angle = (reveal.guide.compass / 8) * Math.PI * 2;
    const stepped = { x: wearer.x + Math.sin(angle) * 5, z: wearer.z - Math.cos(angle) * 5 };
    const before = Math.hypot(plate.x - wearer.x, plate.z - wearer.z);
    const after = Math.hypot(plate.x - stepped.x, plate.z - stepped.z);
    expect(after).toBeLessThan(before);
    expect(reveal.guide.distance).toBeCloseTo(Math.round(before), 0);
  });

  it('still produces more red rounds than the towers ask for', () => {
    // Solo removes hands, not sites — so the campaign is finishable, not merely
    // startable. If a future variant ever drops a site this is what catches it.
    expect(TOTAL_ORBS).toBeGreaterThan(TOTAL_THRESHOLD);
  });
});

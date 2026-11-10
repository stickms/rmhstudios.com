// Host simulation for Altair co-op (2-4 players). Multiplayer sync/state logic
// is the stated exception to "mission-critical tests only" (docs/altair-multiplayer.md):
// a desync here silently ruins every match.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('../../webgl/webgl-context', async (orig) => ({
  ...(await orig<typeof import('../../webgl/webgl-context')>()),
  initWebGL: () => ({}),
}));
vi.mock('../../webgl/webgl-sprite-batch', () => ({ SpriteBatch: class {} }));
vi.mock('../../webgl/webgl-shapes', () => ({ ShapeBatch: class {} }));
vi.mock('../../webgl/webgl-textures', async (orig) => ({
  ...(await orig<typeof import('../../webgl/webgl-textures')>()),
  setGLContext: () => {},
}));
vi.mock('../../sprites/sprite-defs', async (orig) => ({
  ...(await orig<typeof import('../../sprites/sprite-defs')>()),
  initAllSpriteSheets: () => {},
}));

import { createRng } from '../../__tests__/golden-harness';
import type { HostSim, HostPlayerInit } from '../host-sim';
import { decodeSnapshot } from '../../../multiplayer/snapshot';

// Several tests simulate thousands of steps of a full world; keep CI load from tripping the 5 s default.
vi.setConfig({ testTimeout: 60_000 });

type Mod = typeof import('../host-sim');

/** Fresh module registry per sim: the engine keeps module-level state (pickup merge timer, nav cache). */
async function load(): Promise<Mod> {
  vi.resetModules();
  return import('../host-sim');
}

const TWO: HostPlayerInit[] = [
  { playerId: 'a', classId: 'knight', slot: 0 },
  { playerId: 'b', classId: 'ranger', slot: 1 },
];

async function makeSim(seed: number, players: HostPlayerInit[] = TWO, opts: Partial<import('../host-sim').HostSimOptions> = {}) {
  const mod = await load();
  const rng = createRng(seed);
  vi.spyOn(Math, 'random').mockImplementation(() => rng.next());
  const sim = mod.createHostSim({ players, ...opts });
  return { sim, mod, rng };
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Scripted movement per player, a pure function of (step, slot). */
function script(step: number, slot: number): { dx: number; dy: number } {
  const seg = Math.floor(step / 90);
  if ((seg + slot) % 4 === 3) return { dx: 0, dy: 0 };
  const ang = seg * 1.1 + slot * 2.1;
  return { dx: Math.cos(ang), dy: Math.sin(ang) };
}

function runScripted(sim: HostSim, steps: number, skip?: string) {
  const ids = sim.playerIds();
  for (let i = 0; i < steps; i++) {
    for (const id of ids) {
      if (id === skip) continue;
      const slot = ids.indexOf(id);
      const { dx, dy } = script(i, slot);
      sim.setInput(id, dx, dy);
    }
    sim.step();
  }
}

function worldHash(sim: HostSim): string {
  const replacer = (_k: string, v: unknown) => {
    if (v instanceof Set) return { __set: [...v].sort() };
    if (v instanceof Map) return { __map: [...v.entries()] };
    if (typeof v === 'number' && !Number.isFinite(v)) return `__num:${String(v)}`;
    return v;
  };
  return createHash('sha256').update(JSON.stringify(sim.world, replacer)).digest('hex').slice(0, 16);
}

describe('HostSim: determinism', () => {
  it('an N-player run is bit-identical for the same seed and inputs', async () => {
    const a = await makeSim(11, [...TWO, { playerId: 'c', classId: 'necromancer', slot: 2 }]);
    runScripted(a.sim, 900);
    const hashA = worldHash(a.sim);
    const snapA = JSON.stringify(a.sim.getSnapshot());
    const callsA = a.rng.calls();
    vi.restoreAllMocks();

    const b = await makeSim(11, [...TWO, { playerId: 'c', classId: 'necromancer', slot: 2 }]);
    runScripted(b.sim, 900);
    expect(worldHash(b.sim)).toBe(hashA);
    expect(JSON.stringify(b.sim.getSnapshot())).toBe(snapA);
    expect(b.rng.calls()).toBe(callsA);
    expect(a.sim.tick).toBe(900);
  });

  it('a different seed diverges (the hash is not vacuous)', async () => {
    const a = await makeSim(11);
    runScripted(a.sim, 600);
    const h = worldHash(a.sim);
    vi.restoreAllMocks();
    const b = await makeSim(12);
    runScripted(b.sim, 600);
    expect(worldHash(b.sim)).not.toBe(h);
  });
});

describe('HostSim: stepping', () => {
  it('a 2-player run where player 2 never moves still advances', async () => {
    const { sim } = await makeSim(21);
    const bStart = { x: sim.getPlayer('b')!.x, y: sim.getPlayer('b')!.y };
    runScripted(sim, 900, 'b');
    expect(sim.status).toBe('playing');
    expect(sim.world.time).toBeGreaterThan(14);
    // Never walked: only class abilities / knockback can shift it, nowhere near a 15 s walk (~3000 px).
    expect(Math.hypot(sim.getPlayer('b')!.x - bStart.x, sim.getPlayer('b')!.y - bStart.y)).toBeLessThan(500);
    const a = sim.getPlayer('a')!;
    expect(Math.hypot(a.x, a.y)).toBeGreaterThan(50); // the mover moved
    expect(sim.world.enemies.length).toBeGreaterThan(0);
    expect(sim.world.sharedKills).toBeGreaterThan(0); // the idle player's weapons fight too
  });

  it('rejects untrusted input: NaN, infinity and oversize vectors are neutralised', async () => {
    const { sim } = await makeSim(22);
    sim.setInput('a', NaN, 5);
    for (let i = 0; i < 30; i++) sim.step();
    const a = sim.getPlayer('a')!;
    expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true);
    sim.setInput('a', 1e9, 0); // clamped to the unit circle: speed stays at walk speed
    const x0 = a.x;
    for (let i = 0; i < 60; i++) sim.step();
    expect(Math.abs(sim.getPlayer('a')!.x - x0)).toBeLessThan(400);
    sim.setInput('nobody', 1, 1); // unknown ids are ignored
  });

  it('every player keeps their own class, loadout and ability state across the swap', async () => {
    const { sim } = await makeSim(23);
    runScripted(sim, 300);
    const la = sim.getLoadout('a')!;
    const lb = sim.getLoadout('b')!;
    expect(la.weapons[0].weaponId).toBe('broad_sword');
    expect(lb.weapons[0].weaponId).not.toBe('broad_sword');
    expect(la.weapons).not.toBe(lb.weapons);
    expect(sim.getPlayer('a')!.classId).toBe('knight');
    expect(sim.getPlayer('b')!.classId).toBe('ranger');
  });

  it('shared enemies scale with the living player count and new enemies take the multipliers once', async () => {
    const { sim, mod } = await makeSim(24, [
      { playerId: 'a', classId: 'knight', slot: 0 },
      { playerId: 'b', classId: 'knight', slot: 1 },
      { playerId: 'c', classId: 'knight', slot: 2 },
    ]);
    sim.step();
    const s = sim.world.scalingState;
    expect(s.hpMultiplier).toBeCloseTo(2, 5);
    expect(s.spawnBudgetMultiplier).toBeGreaterThan(2);
    expect(s.bossHpMultiplier).toBeGreaterThan(s.hpMultiplier);
    const { spawnEnemyAt } = await import('../../wave-director');
    const e = spawnEnemyAt(sim.world, 'shambler', 5000, 5000, 1)!;
    const base = e.maxHp;
    const dmg = e.damage;
    sim.step();
    expect(e.maxHp).toBeCloseTo(base * s.hpMultiplier, 5);
    expect(e.damage).toBeCloseTo(dmg * s.damageMultiplier, 5);
    sim.step();
    expect(e.maxHp).toBeCloseTo(base * s.hpMultiplier, 5); // not re-applied
    expect(mod.FIXED_DT).toBeCloseTo(1 / 60, 10);
  });
});

describe('HostSim: kills and XP attribution', () => {
  it('a kill is credited to the player who finished it, shared once', async () => {
    const { sim } = await makeSim(31);
    const a = sim.world.players.get('a')!;
    const b = sim.world.players.get('b')!;
    // Far apart so only b's weapons reach the victim.
    a.x = -4000;
    a.y = -4000;
    b.x = 4000;
    b.y = 4000;
    const { spawnEnemyAt } = await import('../../wave-director');
    const victim = spawnEnemyAt(sim.world, 'shambler', b.x + 40, b.y, 1)!;
    victim.hp = 1;
    victim.maxHp = 1;
    const before = sim.world.sharedKills;
    for (let i = 0; i < 200 && !victim.isDead; i++) sim.step();
    expect(victim.isDead).toBe(true);
    expect(victim.lastHitBy).toBe('b');
    expect(sim.world.sharedKills).toBeGreaterThan(before);
    expect(sim.getPlayerProgress('b')!.kills).toBeGreaterThanOrEqual(1);
  });

  it('per-player kills always sum to the shared kill count', async () => {
    const { sim } = await makeSim(32);
    runScripted(sim, 1500);
    const sum = sim.playerIds().reduce((n, id) => n + sim.getPlayerProgress(id)!.kills, 0);
    expect(sum).toBe(sim.world.sharedKills);
    expect(sum).toBeGreaterThan(0);
  });

  it('XP goes to the collector with a trickle to teammates, and each player levels independently', async () => {
    const { sim } = await makeSim(33);
    const grant = (sim as unknown as { grantXp(p: unknown, n: number, t: boolean): void });
    const byId = (sim as unknown as { byId: Map<string, unknown> }).byId;
    grant.grantXp(byId.get('a'), 100, true);
    const pa = sim.getPlayerProgress('a')!;
    const pb = sim.getPlayerProgress('b')!;
    expect(pa.level).toBeGreaterThan(1);
    expect(pb.xp > 0 || pb.level > 1).toBe(true); // got a share
    expect(pb.level).toBeLessThan(pa.level); // but far less than the collector
  });
});

describe('HostSim: downed, revive, dead', () => {
  function neutralise(sim: HostSim, id: string) {
    const e = sim.world.players.get(id)!;
    e.maxHp = 1e6;
    e.hp = 1e6;
  }

  it('0 HP downs a player; a teammate standing beside them revives them', async () => {
    const { sim, mod } = await makeSim(41);
    neutralise(sim, 'b');
    const a = sim.world.players.get('a')!;
    const b = sim.world.players.get('b')!;
    b.x = a.x + 30;
    b.y = a.y;
    a.hp = 0;
    sim.step();
    expect(a.isDowned).toBe(true);
    expect(sim.drainEvents().some((e) => e.type === 'player_downed' && e.playerId === 'a')).toBe(true);
    const steps = Math.ceil(mod.REVIVE_SECONDS * 60) + 30;
    let progressSeen = 0;
    for (let i = 0; i < steps && a.isDowned; i++) {
      b.x = a.x + 30;
      b.y = a.y;
      sim.step();
      progressSeen = Math.max(progressSeen, a.revivalProgress);
    }
    expect(progressSeen).toBeGreaterThan(0.3);
    expect(a.isDowned).toBe(false);
    expect(a.isDead).toBe(false);
    expect(a.hp).toBeGreaterThanOrEqual(Math.ceil(a.maxHp * mod.REVIVE_HP_FRACTION) - 1);
    expect(a.iFrames).toBeGreaterThan(0);
    expect(sim.getPlayerStats().find((s) => s.playerId === 'b')!.revivesGiven).toBe(1);
    expect(sim.getPlayerStats().find((s) => s.playerId === 'a')!.revivesReceived).toBe(1);
  });

  it('a downed player nobody reaches dies when the timer runs out; progress decays without a reviver', async () => {
    const { sim, mod } = await makeSim(42);
    neutralise(sim, 'b');
    const a = sim.world.players.get('a')!;
    const b = sim.world.players.get('b')!;
    b.x = 6000;
    b.y = 6000;
    a.hp = 0;
    for (let i = 0; i < 10; i++) sim.step();
    expect(a.isDowned).toBe(true);
    a.revivalProgress = 0.5; // pretend someone started and left
    sim.step();
    expect(a.revivalProgress).toBeLessThan(0.5);
    const steps = Math.ceil(mod.DOWN_SECONDS * 60);
    for (let i = 0; i < steps + 20 && !a.isDead; i++) sim.step();
    expect(a.isDead).toBe(true);
    expect(a.isSpectating).toBe(true);
    expect(a.isDowned).toBe(false);
    expect(sim.drainEvents().some((e) => e.type === 'player_dead' && e.playerId === 'a')).toBe(true);
    // A dead player is never revived, even with a teammate standing on them.
    b.x = a.x;
    b.y = a.y;
    for (let i = 0; i < 300; i++) sim.step();
    expect(a.isDead).toBe(true);
    expect(sim.status).toBe('playing');
  });

  it('everyone downed or dead is a team wipe: defeat, one tpk event, stepping stops', async () => {
    const { sim } = await makeSim(43);
    for (const e of sim.world.players.values()) e.hp = 0;
    sim.step();
    expect(sim.status).toBe('defeat');
    const events = sim.drainEvents();
    expect(events.filter((e) => e.type === 'tpk')).toHaveLength(1);
    const t = sim.world.time;
    sim.step();
    expect(sim.world.time).toBe(t);
    expect(sim.getPlayerStats().every((s) => !s.wasAliveAtEnd)).toBe(true);
  });
});

describe('HostSim: level-up queue', () => {
  function grant(sim: HostSim, id: string, amount: number) {
    const s = sim as unknown as { grantXp(p: unknown, n: number, t: boolean): void; byId: Map<string, unknown> };
    s.grantXp(s.byId.get(id), amount, false);
  }

  it('exposes a pending choice for exactly the player who levelled', async () => {
    const { sim } = await makeSim(51);
    grant(sim, 'a', 40);
    sim.step();
    expect(sim.pendingLevelUpPlayers()).toEqual(['a']);
    const pending = sim.getPendingLevelUp('a')!;
    expect(pending.choices.length).toBeGreaterThan(0);
    expect(sim.getPendingLevelUp('b')).toBeNull();
    expect(sim.drainEvents().some((e) => e.type === 'player_level_up' && e.playerId === 'a')).toBe(true);
    expect(sim.getSnapshot().players.find((p) => p.playerId === 'a')!.levelUpPending).toBe(true);
  });

  it('accepts the chosen option, rejects bad indices, and the world keeps running meanwhile', async () => {
    const { sim } = await makeSim(52);
    grant(sim, 'a', 40);
    sim.step();
    const t = sim.world.time;
    const a = sim.world.players.get('a')!;
    for (let i = 0; i < 30; i++) {
      sim.step();
      expect(a.iFrames).toBeGreaterThan(0); // invulnerable while the overlay is open
    }
    expect(sim.world.time).toBeGreaterThan(t); // no pause
    expect(sim.chooseUpgrade('a', -1)).toBe(false);
    expect(sim.chooseUpgrade('a', 99)).toBe(false);
    expect(sim.chooseUpgrade('b', 0)).toBe(false); // nothing pending for b
    const before = JSON.stringify(sim.getLoadout('a'));
    const choice = sim.getPendingLevelUp('a')!.choices[0];
    expect(sim.chooseUpgrade('a', 0)).toBe(true);
    expect(sim.getPendingLevelUp('a')).toBeNull();
    if (choice.type !== 'gold') expect(JSON.stringify(sim.getLoadout('a'))).not.toBe(before);
  });

  it('auto-picks the first option after 10 s and queues further level-ups one at a time', async () => {
    const { sim, mod } = await makeSim(53);
    expect(mod.LEVEL_UP_TIMEOUT).toBe(10);
    grant(sim, 'a', 400); // several levels
    const owed = sim.getPlayerProgress('a')!.level - 1;
    expect(owed).toBeGreaterThan(1);
    sim.step();
    const first = sim.getPendingLevelUp('a')!;
    for (let i = 0; i < 9 * 60; i++) sim.step();
    expect(sim.getPendingLevelUp('a')).toBe(first); // still open at ~9 s
    for (let i = 0; i < 2 * 60; i++) sim.step();
    const second = sim.getPendingLevelUp('a');
    expect(second).not.toBe(first); // first was auto-picked, the next one is now open
    expect(second === null || second.remaining > 8).toBe(true);
  });

  it('upgrades mutate the loadout in place and refresh cached stats', async () => {
    const { sim } = await makeSim(54);
    const loadout = sim.getLoadout('a')!;
    const weapon = loadout.weapons[0];
    const s = sim as unknown as { applyUpgrade(p: unknown, c: unknown): void; byId: Map<string, { sim: { effectiveStats: unknown } }> };
    sim.step();
    expect(s.byId.get('a')!.sim.effectiveStats).not.toBeNull();
    s.applyUpgrade(s.byId.get('a'), { type: 'upgrade_weapon', weaponId: weapon.weaponId, newLevel: 2 });
    expect(sim.getLoadout('a')!.weapons[0]).toBe(weapon); // same object: runtime weapon state stays attached
    expect(weapon.level).toBe(2);
    expect(s.byId.get('a')!.sim.effectiveStats).toBeNull();
  });
});

describe('HostSim: bosses', () => {
  it('a boss spawns once and the fight runs with 3 players (and shows up in the snapshot)', async () => {
    vi.resetModules();
    vi.doMock('../../wave-director', async () => {
      const actual = await vi.importActual<typeof import('../../wave-director')>('../../wave-director');
      let forced = false;
      return {
        ...actual,
        // The timeline's boss waves are shadowed by the post-boss wave (see golden-harness), so inject the event.
        updateWaveDirector: (w: Parameters<typeof actual.updateWaveDirector>[0], st: Parameters<typeof actual.updateWaveDirector>[1], d: number) => {
          const ev = actual.updateWaveDirector(w, st, d);
          if (!forced && w.time >= 1) {
            forced = true;
            ev.bossSpawn = 'hollow_king';
          }
          return ev;
        },
      };
    });
    const mod = await import('../host-sim');
    vi.doUnmock('../../wave-director');
    const rng = createRng(71);
    vi.spyOn(Math, 'random').mockImplementation(() => rng.next());
    const sim = mod.createHostSim({
      players: [
        { playerId: 'a', classId: 'knight', slot: 0 },
        { playerId: 'b', classId: 'ranger', slot: 1 },
        { playerId: 'c', classId: 'arcanist', slot: 2 },
      ],
    });
    runScripted(sim, 600);
    const boss = sim.world.enemies.find((e) => e.isBoss)!;
    expect(boss).toBeDefined();
    expect(sim.world.bossActive).toBe(true);
    expect(sim.drainEvents().filter((e) => e.type === 'boss_spawn')).toHaveLength(1);
    expect(boss.maxHp).toBeGreaterThan(0);
    const snap = decodeSnapshot(JSON.parse(JSON.stringify(sim.getSnapshot())))!;
    expect(snap.enemies.some((e) => e.isBoss)).toBe(true);
    expect(snap.bossActive).toBe(true);
  });
});

describe('HostSim: drop-in and snapshots', () => {
  it('a drop-in appears beside a living player with a grace window', async () => {
    const { sim } = await makeSim(61);
    runScripted(sim, 120);
    sim.addPlayer({ playerId: 'c', classId: 'arcanist', slot: 2 });
    const c = sim.world.players.get('c')!;
    const a = sim.world.players.get('a')!;
    expect(Math.hypot(c.x - a.x, c.y - a.y)).toBeLessThan(120);
    expect(c.iFrames).toBeGreaterThan(0);
    expect(sim.playerIds()).toEqual(['a', 'b', 'c']);
    runScripted(sim, 60);
    sim.removePlayer('c');
    expect(sim.playerIds()).toEqual(['a', 'b']);
    sim.step(); // survives a removal
  });

  it('getSnapshot survives JSON and decodes to the same state (within quantisation)', async () => {
    const { sim } = await makeSim(62);
    runScripted(sim, 600);
    const wire = JSON.parse(JSON.stringify(sim.getSnapshot()));
    const dec = decodeSnapshot(wire)!;
    expect(dec).not.toBeNull();
    expect(dec.tick).toBe(600);
    expect(dec.sharedKills).toBe(sim.world.sharedKills);
    for (const p of dec.players) {
      const e = sim.world.players.get(p.playerId)!;
      expect(Math.abs(p.x - e.x)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(Math.abs(p.y - e.y)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(p.classId).toBe(e.classId);
    }
    const near = dec.enemies.length;
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThanOrEqual(sim.world.enemies.length);
    // The wire stays small: well under 64 KB with hundreds of entities.
    expect(JSON.stringify(wire).length).toBeLessThan(64 * 1024);
  });

  it('reuses one snapshot object between sends (no per-send array growth)', async () => {
    const { sim } = await makeSim(63);
    runScripted(sim, 200);
    const s1 = sim.getSnapshot();
    const enemiesArr = s1.enemies;
    runScripted(sim, 3);
    const s2 = sim.getSnapshot();
    expect(s2).toBe(s1);
    expect(s2.enemies).toBe(enemiesArr);
  });
});

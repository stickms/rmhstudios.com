// =============================================================================
// ALTAIR ENGINE -- Golden-master harness (headless, deterministic)
// =============================================================================
// Drives the REAL createGameLoop (no copy of its step body) with:
//   - WebGL/sprite modules mocked by the test file (see golden-master.test.ts),
//   - Math.random replaced by a seeded PRNG,
//   - requestAnimationFrame / performance.now replaced by a manual clock,
//   - the real zustand run store + generateUpgradeChoices standing in for the
//     React GameScreen's level-up flow (mirrors GameScreen.tsx).
// A scripted movement sequence plays one input per frame. At checkpoints the
// whole world is serialised and hashed. Any change to gameplay changes a hash.
// =============================================================================

import { createHash } from 'node:crypto';
import { vi } from 'vitest';
import type { GameWorld } from '../types';

export interface Scenario {
  name: string;
  classId: string;
  seed: number;
  frames: number;
  /** Fast-forward world.time (reach later waves / the first boss). */
  startTime?: number;
  /** 'walk' = scripted wandering; 'still' = never move (forces a death). */
  input: 'walk' | 'still';
  /**
   * Inject a boss spawn event from the wave director once world.time passes
   * `at`. (The wave timeline's boss waves are shadowed by the post-boss wave
   * that starts at the same instant, so the director never emits them on its
   * own — the harness injects the same event the loop would receive, without
   * touching engine code.)
   */
  forceBoss?: { at: number; bossId: string };
  /** Hash cadence in frames. */
  checkpointEvery?: number;
}

export interface GoldenResult {
  checkpoints: [number, string][];
  events: string[];
  final: {
    frames: number;
    time: number;
    kills: number;
    level: number;
    xp: number;
    coins: number;
    enemies: number;
    rngCalls: number;
    died: boolean;
  };
}

/** mulberry32 — tiny, well-known, fully deterministic. */
export function createRng(seed: number): { next: () => number; calls: () => number; state: () => number } {
  let a = seed >>> 0;
  let calls = 0;
  return {
    next() {
      calls++;
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    calls: () => calls,
    state: () => a,
  };
}

/** Scripted movement: pure function of the frame index. */
export function scriptedInput(frame: number): { dx: number; dy: number } {
  const seg = Math.floor(frame / 75);
  // every 5th segment the player stands still (exercises idle behaviour)
  if (seg % 5 === 4) return { dx: 0, dy: 0 };
  const ang = seg * 1.3 + (seg % 3) * 0.7;
  return { dx: Math.cos(ang), dy: Math.sin(ang) };
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Set) return { __set: [...value].sort() };
  if (value instanceof Map) return { __map: [...value.entries()] };
  if (typeof value === 'number' && !Number.isFinite(value)) return `__num:${String(value)}`;
  return value;
}

/** Canonical full-world serialisation (exact doubles; sets sorted). */
export function serialiseWorld(world: GameWorld, extra: unknown): string {
  return JSON.stringify({ world, extra }, replacer);
}

export function hashString(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

/**
 * Engine modules keep module-level state (pickup merge timer, position-history
 * accumulator, nav cache), so every scenario gets a FRESH module registry —
 * otherwise a scenario's result would depend on which ran before it.
 */
export async function runScenario(sc: Scenario): Promise<GoldenResult> {
  vi.resetModules();
  if (sc.forceBoss) {
    const fb = sc.forceBoss;
    vi.doMock('../wave-director', async () => {
      const actual = await vi.importActual<typeof import('../wave-director')>('../wave-director');
      let forced = false;
      return {
        ...actual,
        updateWaveDirector: (w: GameWorld, st: never, d: number) => {
          const ev = actual.updateWaveDirector(w, st, d);
          if (!forced && w.time >= fb.at) {
            forced = true;
            ev.bossSpawn = fb.bossId;
          }
          return ev;
        },
      };
    });
  } else {
    vi.doUnmock('../wave-director');
  }
  const { createGameWorld, createGameLoop, createTileGenerator } = await import('../game-loop');
  const { generateUpgradeChoices } = await import('../level-up-system');
  const { useAltairGameStore } = await import('../../stores/game-store');
  const rng = createRng(sc.seed);
  const randSpy = vi.spyOn(Math, 'random').mockImplementation(() => rng.next());
  vi.spyOn(performance, 'now').mockReturnValue(0);

  const raf: { pending: ((now: number) => void) | null } = { pending: null };
  vi.stubGlobal('requestAnimationFrame', (cb: (now: number) => void) => {
    raf.pending = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    raf.pending = null;
  });
  const fakeOverlay = {
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    parentElement: null,
    getContext: () => ({}),
  };
  vi.stubGlobal('document', { createElement: () => fakeOverlay });
  const canvas = { width: 1280, height: 720, parentElement: null } as unknown as HTMLCanvasElement;

  // ---- run store (mirrors GameScreen) ----
  const store = useAltairGameStore;
  store.getState().startRun(sc.classId, false, {}, 0, 0, 0, false);
  const world = createGameWorld(canvas.width, canvas.height, sc.classId, false);
  world.time = sc.startTime ?? 0;
  store.getState().addWeapon(world.weapons[0]?.weaponId || '');
  store.setState({ hp: world.player.hp, maxHp: world.player.maxHp });
  const tileGen = createTileGenerator();

  const events: string[] = [];
  let frame = 0;
  let died = false;

  const syncStoreToWorld = () => {
    const s = store.getState();
    world.weapons = s.weapons.map((sw, i) => {
      const existing = i < world.weapons.length ? world.weapons[i] : null;
      return {
        weaponId: sw.weaponId,
        level: sw.level,
        evolved: sw.evolved,
        cooldownTimer: existing?.cooldownTimer ?? 0,
        activeTimer: existing?.activeTimer,
        orbitAngle: existing?.orbitAngle,
      };
    });
    world.passives = s.passives.map((sp) => ({ passiveId: sp.passiveId, level: sp.level }));
    world.catalysts = s.catalysts.map((sc2) => ({ catalystId: sc2.catalystId, level: sc2.level }));
  };

  const loop = createGameLoop(canvas, world, tileGen, {
    onPlayerDamage: () => {
      store.setState({ hp: world.player.hp });
      if (world.player.hp <= 0 && !died) {
        died = true;
        events.push(`f${frame}:death`);
        store.getState().die();
      }
    },
    onPlayerHeal: () => store.setState({ hp: world.player.hp }),
    onXPGain: (amount) => {
      const prev = store.getState().level;
      store.getState().addXP(amount);
      const s = store.getState();
      if (s.level > prev) {
        const choices = generateUpgradeChoices(world.weapons, world.passives, world.catalysts, s.banishedIds, false, 0);
        events.push(`f${frame}:levelup:${s.level}:${choices.length}`);
        s.setUpgradeChoices(choices);
        // Deterministic pick, varied by level so weapons/passives both grow.
        s.pickUpgrade(choices.length ? s.level % choices.length : 0);
        syncStoreToWorld();
      }
    },
    onCoinGain: (amount) => store.getState().addCoins(amount, 'enemyDrops'),
    onKill: (defId) => store.getState().addKill(defId),
    onEnemySpawns: () => {},
    onLevelUp: () => {},
    onBossSpawn: (id) => events.push(`f${frame}:bossSpawn:${id}`),
    onBossKill: (id) => events.push(`f${frame}:bossKill:${id}`),
    onVictory: () => events.push(`f${frame}:victory`),
    onWeaponDisable: () => {},
  });

  loop.start();
  const every = sc.checkpointEvery ?? 100;
  const checkpoints: [number, string][] = [];
  const FRAME_MS = 16.7; // slightly > 1/60 s so each frame runs >=1 fixed step
  let now = 0;

  for (frame = 1; frame <= sc.frames; frame++) {
    const inp = sc.input === 'still' ? { dx: 0, dy: 0 } : scriptedInput(frame);
    world.inputState.dx = inp.dx;
    world.inputState.dy = inp.dy;
    now += FRAME_MS;
    const cb = raf.pending;
    raf.pending = null;
    if (!cb) break;
    cb(now);
    if (frame % every === 0 || frame === sc.frames) {
      const st = store.getState();
      const extra = {
        rng: [rng.calls(), rng.state()],
        store: { xp: st.xp, level: st.level, kills: st.kills, coins: st.coins, hp: st.hp },
        props: tileGen.getDamageableProps(),
      };
      checkpoints.push([frame, hashString(serialiseWorld(world, extra))]);
    }
    if (died) {
      // record the death frame as a final checkpoint then stop
      if (checkpoints[checkpoints.length - 1]?.[0] !== frame) {
        const st = store.getState();
        checkpoints.push([frame, hashString(serialiseWorld(world, { rng: [rng.calls(), rng.state()], store: { xp: st.xp, level: st.level, kills: st.kills } }))]);
      }
      break;
    }
  }
  loop.destroy();
  randSpy.mockRestore();
  vi.unstubAllGlobals();

  const st = store.getState();
  return {
    checkpoints,
    events,
    final: {
      frames: frame,
      time: world.time,
      kills: st.kills,
      level: st.level,
      xp: st.xp,
      coins: st.coins,
      enemies: world.enemies.length,
      rngCalls: rng.calls(),
      died,
    },
  };
}

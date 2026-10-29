/**
 * Custom HUDs in game: the HudState → TestState adapter, the animation
 * events, HUD selection persistence and the editor's handoff, and fidelity —
 * the in-game scene of a HUD must put every panel exactly where the HUD
 * editor's preview puts it (the base HUD and two sample custom HUDs, at
 * 1920×1080 and 1280×720), and the panels the game still draws itself must
 * follow the HUD's hudlayout.res.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { varsFromState, type TestState } from '@/lib/tf2-hud/fixtures';
import { gateFor, progressFor } from '@/lib/tf2-hud/game-state';
import { buildScene, type SceneContext } from '@/lib/tf2-hud/scene/build';
import type { Scene } from '@/lib/tf2-hud/scene/types';
import { PC_ENV } from '@/lib/tf2-hud/scheme/cond';
import { parseScheme } from '@/lib/tf2-hud/scheme/scheme';
import {
  mergeLayout,
  resolvePanel,
  TF2_LAYOUT,
  type HudLayout,
} from '@/components/tf2-game/hud-layout';
import { SCENARIOS } from '@/components/tf2-game/preview/sample-states';
import {
  emptyAmmo,
  emptyConditions,
  emptyEngineer,
  emptyHudState,
  emptyMeters,
  type HudLocalPlayer,
  type HudState,
} from '../hud-state';
import { CLASS_ID, eventsFor, liveVars, toTestState, weaponFor } from './adapter';
import { bindingsFor, inGameFiles } from './bindings';
import { hudAnimEvents } from './events';
import { layoutOverrides } from './layout';
import { applySampleEdits, SAMPLE_HUDS } from './sample-huds';
import { clearOfReserve, InGameScene, isStacked, type SceneSource } from './scene';
import {
  DEFAULT_SELECTION,
  isDraftSavedMessage,
  loadSelection,
  parseHudLink,
  parseSelection,
  saveSelection,
  selectionKey,
  SELECTION_KEY,
  testInGameUrl,
  type KeyValueStorage,
} from './selection';

const BASE = path.resolve(import.meta.dirname, '../../../../public/tf2-hud/base');
const readBase = (p: string): string | undefined => {
  const f = path.join(BASE, p);
  return existsSync(f) ? readFileSync(f, 'utf8') : undefined;
};

function player(over: Partial<HudLocalPlayer> = {}): HudLocalPlayer {
  return {
    id: 1,
    name: 'Tester',
    team: 3,
    cls: 5,
    alive: true,
    health: 120,
    maxHealth: 150,
    maxBuffedHealth: 225,
    ammo: { ...emptyAmmo(), kind: 'clip', clip: 30, maxClip: 40, reserve: 120, maxReserve: 150 },
    activeSlot: 1,
    activeWeapon: { slot: 1, defindex: 29, name: 'Medi Gun', active: true },
    slots: [],
    meters: { ...emptyMeters(), uber: 0.62 },
    conditions: emptyConditions(),
    engineer: null,
    respawnIn: null,
    spectating: null,
    ...over,
  };
}

function state(over: Partial<HudState> = {}, local: Partial<HudLocalPlayer> = {}): HudState {
  return { ...emptyHudState('tf2'), now: 50, connected: true, local: player(local), ...over };
}

/* ─────────────────────────── adapter ─────────────────────────── */

describe('toTestState', () => {
  it('maps every TestState field from a medic on BLU in a CP round', () => {
    const s = state({
      match: {
        ...emptyHudState().match,
        mode: 'cp',
        roundState: 'running',
        timer: { remaining: 271.3, setup: false, paused: false, overtime: false, length: 600 },
        redScore: 2,
        blueScore: 5,
      },
    });
    const t = toTestState(s);
    expect(t).toEqual<TestState>({
      playerClass: 'medic',
      team: 'blue',
      health: 120,
      maxHealth: 150,
      ammoClip: 30,
      ammoReserve: 120,
      metal: 0,
      charge: 62,
      redScore: 2,
      blueScore: 5,
      roundSeconds: 272,
      playerName: 'Tester',
      currency: 0,
      progress: (271.3 / 600) * 100,
      weapon: 'medigun',
      pipes: 0,
      meter: 0,
      sentryLevel: 0,
      events: [],
    });
  });

  it('maps every class', () => {
    for (const [cls, id] of Object.entries(CLASS_ID)) {
      expect(toTestState(state({}, { cls: Number(cls) })).playerClass).toBe(id);
    }
  });

  it('reads no-clip and melee ammo the way CTFHudWeaponAmmo shows it', () => {
    const flame = toTestState(
      state(
        {},
        {
          cls: 7,
          ammo: { ...emptyAmmo(), kind: 'reserve-only', clip: -1, reserve: 170, maxReserve: 200 },
        },
      ),
    );
    expect([flame.ammoClip, flame.ammoReserve]).toEqual([170, 170]);
    const melee = toTestState(state({}, { cls: 6, ammo: emptyAmmo() }));
    expect([melee.ammoClip, melee.ammoReserve]).toEqual([0, 0]);
  });

  it('dead players have no health; overheal passes through', () => {
    expect(toTestState(state({}, { alive: false, health: 0, respawnIn: 7.2 })).health).toBe(0);
    expect(toTestState(state({}, { health: 210 })).health).toBe(210);
  });

  it('engineer metal and sentry level; demoman stickies; spy cloak; sniper charge', () => {
    const eng = emptyEngineer();
    eng.metal = 145;
    eng.sentry = { ...eng.sentry, exists: true, level: 3 };
    const e = toTestState(state({}, { cls: 9, engineer: eng }));
    expect([e.metal, e.sentryLevel, e.weapon]).toEqual([145, 3, 'stock-engineer']);
    const notBuilt = toTestState(state({}, { cls: 9, engineer: emptyEngineer() }));
    expect(notBuilt.sentryLevel).toBe(0);

    const d = toTestState(
      state({}, { cls: 4, meters: { ...emptyMeters(), stickyCount: 5, stickyCharge: 0.4 } }),
    );
    expect([d.weapon, d.pipes, d.meter]).toEqual(['stickies', 5, 40]);
    const sp = toTestState(state({}, { cls: 8, meters: { ...emptyMeters(), cloak: 0.25 } }));
    expect([sp.weapon, sp.meter]).toEqual(['cloak', 25]);
    const sn = toTestState(state({}, { cls: 2, meters: { ...emptyMeters(), sniperCharge: 0.5 } }));
    expect([sn.weapon, sn.meter]).toEqual(['stock-sniper', 50]);
  });

  it('CTF scores are flag captures; KOTH uses the running clock', () => {
    const ctf = toTestState(
      state({
        match: {
          ...emptyHudState().match,
          mode: 'ctf',
          redScore: 9,
          blueScore: 9,
          redFlagCaps: 1,
          blueFlagCaps: 2,
        },
      }),
    );
    expect([ctf.redScore, ctf.blueScore]).toEqual([1, 2]);
    const koth = toTestState(
      state({
        match: {
          ...emptyHudState().match,
          mode: 'koth',
          koth: { red: 120, blue: 64.2, active: 3 },
        },
      }),
    );
    expect(koth.roundSeconds).toBe(65);
  });

  it('events: recent damage, carrying the flag, stalemate', () => {
    const s = state({
      damageNumbers: [{ id: 1, at: 49.5, amount: 40, crit: 0, screen: null, world: null }],
      match: {
        ...emptyHudState().match,
        roundState: 'stalemate',
        flags: [
          {
            team: 2,
            status: 'stolen',
            carrierName: 'Tester',
            carriedByLocal: true,
            returnsIn: null,
          },
        ],
      },
    });
    expect(eventsFor(s)).toEqual(['damage', 'flag', 'stalemate']);
    expect(eventsFor({ ...s, now: 60 })).toEqual(['flag', 'stalemate']);
  });

  it('spectators keep the defaults but read the match', () => {
    const t = toTestState({ ...emptyHudState(), local: player({ team: 0, cls: 0 }) });
    expect(t.playerClass).toBe('scout');
    expect(t.playerName).toBe('Tester');
  });

  it('weaponFor never picks a meter the stock loadout lacks', () => {
    expect(weaponFor(player({ cls: 2 }), 'sniper')).toBe('stock-sniper');
  });

  it('liveVars adds what only the game knows', () => {
    const s = state(
      {
        freezecam: {
          killerName: 'Heavy',
          killerTeam: 2,
          killerCls: 6,
          killerHealth: 200,
          killerMaxHealth: 300,
          kind: 'player',
          dominated: true,
          revenge: false,
          at: 40,
        },
        match: {
          ...emptyHudState().match,
          koth: { red: 61, blue: 180, active: 2 },
          win: { team: 3, reason: 1, redScore: 1, blueScore: 2, top: [], nextRoundIn: 5 },
        },
      },
      { alive: false, respawnIn: 4.2 },
    );
    const v = liveVars(s);
    expect(v.get('respawntime')).toBe('5');
    expect(v.get('killername')).toBe('Heavy');
    expect(v.get('nemesisname')).toBe('Heavy');
    expect(v.get('redtimer')).toBe('1:01');
    expect(v.get('winningteamlabel')).toBe('BLU WINS!');
    expect(v.get('blueteamscore')).toBe('2');
    expect(v.get('health')).toBe('0');
  });
});

/* ─────────────────────────── events ─────────────────────────── */

describe('hudAnimEvents', () => {
  const pair = (s: HudState) => ({ state: s, test: toTestState(s) });
  it('starts the editor’s player events and the game-only ones', () => {
    const a = state({}, { health: 120 });
    const b = state({}, { health: 30 });
    expect(hudAnimEvents(pair(a), pair(b))).toEqual(
      expect.arrayContaining(['HudHealthDyingPulse', 'DamagedPlayer']),
    );
    const engA = emptyEngineer();
    const engB = { ...emptyEngineer(), metal: 25 };
    engA.metal = 200;
    expect(
      hudAnimEvents(
        pair(state({}, { cls: 9, engineer: engA })),
        pair(state({}, { cls: 9, engineer: engB })),
      ),
    ).toContain('AccountMoneyRemoved');
    const disg = emptyConditions();
    disg.disguised = true;
    expect(
      hudAnimEvents(pair(state({}, { cls: 8 })), pair(state({}, { cls: 8, conditions: disg }))),
    ).toContain('HudSpyDisguiseFadeIn');
    const kothA = state({
      match: { ...emptyHudState().match, koth: { red: 1, blue: 1, active: 0 } },
    });
    const kothB = state({
      match: { ...emptyHudState().match, koth: { red: 1, blue: 1, active: 2 } },
    });
    expect(hudAnimEvents(pair(kothA), pair(kothB))).toContain('ActiveTimerHighlight');
    const t1 = state({
      match: {
        ...emptyHudState().match,
        timer: { remaining: 10, setup: false, paused: false, overtime: false, length: 600 },
      },
    });
    const t2 = state({
      match: {
        ...emptyHudState().match,
        timer: { remaining: 130, setup: false, paused: false, overtime: false, length: 600 },
      },
    });
    expect(hudAnimEvents(pair(t1), pair(t2))).toContain('TimerIncrement');
  });
  it('nothing changes, nothing fires', () => {
    const a = state();
    expect(hudAnimEvents(pair(a), pair(a))).toEqual([]);
  });
});

/* ─────────────────────────── selection & handoff ─────────────────────────── */

class MemoryStorage implements KeyValueStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const throwing: KeyValueStorage = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
  removeItem() {
    throw new Error('SecurityError');
  },
};

describe('HUD selection', () => {
  it('round-trips every kind through storage', () => {
    const s = new MemoryStorage();
    for (const sel of [
      { kind: 'draft', id: '0f8fad5b-d9cb-469f-a165-70867728950e' },
      { kind: 'cloud', id: 'my-hud' },
      { kind: 'share', token: 'AbCdEf0123456789_-xyzABC' },
    ] as const) {
      expect(saveSelection(sel, s)).toBe(true);
      expect(loadSelection(s)).toEqual(sel);
    }
    expect(saveSelection(DEFAULT_SELECTION, s)).toBe(true);
    expect(s.map.has(SELECTION_KEY)).toBe(false);
    expect(loadSelection(s)).toEqual(DEFAULT_SELECTION);
  });

  it('survives storage that throws or is missing, and ignores junk', () => {
    expect(loadSelection(throwing)).toEqual(DEFAULT_SELECTION);
    expect(saveSelection({ kind: 'cloud', id: 'x' }, throwing)).toBe(false);
    expect(loadSelection(null)).toEqual(DEFAULT_SELECTION);
    expect(saveSelection({ kind: 'cloud', id: 'x' }, null)).toBe(false);
    const s = new MemoryStorage();
    s.setItem(SELECTION_KEY, 'cloud:../../etc');
    expect(loadSelection(s)).toEqual(DEFAULT_SELECTION);
  });

  it('parses and validates the ?hud= handoff', () => {
    expect(parseSelection('default')).toEqual(DEFAULT_SELECTION);
    expect(parseSelection('draft:abc-123')).toEqual({ kind: 'draft', id: 'abc-123' });
    expect(parseSelection('share:tok_EN-1')).toEqual({ kind: 'share', token: 'tok_EN-1' });
    for (const bad of [
      undefined,
      42,
      '',
      'draft:',
      'draft:a/b',
      'cloud:<script>',
      'evil:abc',
      `cloud:${'x'.repeat(129)}`,
      'javascript:alert(1)',
    ]) {
      expect(parseSelection(bad)).toBeNull();
    }
    const sel = { kind: 'draft', id: 'd1' } as const;
    expect(testInGameUrl(sel)).toBe('/tf2/play?hud=draft%3Ad1');
    expect(parseSelection(decodeURIComponent(testInGameUrl(sel).split('=')[1]))).toEqual(sel);
    expect(selectionKey(sel)).toBe('draft:d1');
  });

  it('reads pasted share links, workshop pages and tokens', () => {
    expect(
      parseHudLink('https://rmhstudios.com/tf2/hud-editor/s/AbCdEf0123456789_-xyzABC'),
    ).toEqual({ kind: 'share', token: 'AbCdEf0123456789_-xyzABC' });
    expect(parseHudLink('https://rmhstudios.com/tf2/hud-editor/h/budhud-remix?x=1')).toEqual({
      kind: 'cloud',
      id: 'budhud-remix',
    });
    expect(parseHudLink('https://rmhstudios.com/tf2/play?hud=cloud%3Aabc')).toEqual({
      kind: 'cloud',
      id: 'abc',
    });
    expect(parseHudLink('AbCdEf0123456789_-xyzABC')).toEqual({
      kind: 'share',
      token: 'AbCdEf0123456789_-xyzABC',
    });
    expect(parseHudLink('short')).toBeNull();
    expect(parseHudLink('https://evil.example/hud.zip')).toBeNull();
  });

  it('only accepts well-formed draft broadcasts', () => {
    expect(isDraftSavedMessage({ type: 'draft-saved', id: 'abc' })).toBe(true);
    expect(isDraftSavedMessage({ type: 'draft-saved', id: '../x' })).toBe(false);
    expect(isDraftSavedMessage('draft-saved')).toBe(false);
  });
});

/* ─────────────────────────── fidelity ─────────────────────────── */

const SCREENS = [
  { w: 1920, h: 1080 },
  { w: 1280, h: 720 },
];

interface Hud {
  name: string;
  read: (p: string) => string | undefined;
}

const HUDS: Hud[] = [
  { name: 'base', read: readBase },
  ...SAMPLE_HUDS.map((h) => {
    const changed = applySampleEdits(h, readBase);
    return { name: h.id, read: (p: string) => changed.get(p) ?? readBase(p) };
  }),
];

function sourceOf(hud: Hud): SceneSource {
  return {
    readText: hud.read,
    scheme: parseScheme(hud.read('resource/clientscheme.res')!, PC_ENV),
    env: PC_ENV,
    minmode: false,
    strings: new Map(),
  };
}

/** The editor's preview for this HUD and test state (useScene's context, minus animations). */
function editorScene(
  hud: Hud,
  test: TestState,
  files: readonly string[],
  screen: { w: number; h: number },
): Scene {
  const src = sourceOf(hud);
  const ctx: SceneContext = {
    readText: hud.read,
    scheme: src.scheme,
    env: PC_ENV,
    screen,
    minmode: false,
    showHidden: false,
    forceShown: new Set(),
    forceHidden: new Set(),
    vars: varsFromState(test),
    strings: new Map(),
    progress: test.progress / 100,
    gate: gateFor(test),
    progressFor: progressFor(test),
    player: { playerClass: test.playerClass, team: test.team },
  };
  return buildScene(ctx, files);
}

function inGame(
  hud: Hud,
  s: HudState,
  screen: { w: number; h: number },
  scene = new InGameScene(sourceOf(hud)),
) {
  const test = toTestState(s);
  return scene.build({
    files: inGameFiles(s, test),
    test,
    vars: liveVars(s, test),
    bindings: bindingsFor(s, test),
    screen,
  });
}

const STATES: Array<[string, () => HudState]> = [
  ['soldier', SCENARIOS.soldierCp],
  ['medic', SCENARIOS.medicPayload],
  ['engineer', SCENARIOS.engineerCtf],
  ['sniper koth', SCENARIOS.sniperKoth],
  ['spy', SCENARIOS.spyDisguise],
  ['spy freezecam', SCENARIOS.spyDead],
  ['win panel', SCENARIOS.winPanel],
];

describe('in-game panels sit exactly where the editor previews them', () => {
  for (const hud of HUDS) {
    for (const screen of SCREENS) {
      for (const [label, make] of STATES) {
        it(`${hud.name} · ${screen.w}×${screen.h} · ${label}`, () => {
          const s = make();
          const game = inGame(hud, s, screen).scene;
          // The editor's renderer on the same files, as its preview builds them for the same test state.
          const editor = editorScene(hud, toTestState(s), inGameFiles(s, toTestState(s)), screen);
          const byId = new Map(editor.nodes.map((n) => [n.id, n]));
          expect(game.nodes.length).toBeGreaterThan(0);
          // The one deliberate difference: the Engineer's building panels stack (the game's status
          // container) where the editor previews each file at its own origin.
          const stackOffset = new Map<string, number>();
          let y = 0;
          for (const f of inGameFiles(s, toTestState(s)).filter(isStacked)) {
            stackOffset.set(f, y);
            y += editor.nodes.find((n) => n.isFrame && n.id.startsWith(`${f}#`))?.rect.h ?? 0;
          }
          const shifted = (
            r: { x: number; y: number; w: number; h: number } | undefined,
            file: string,
          ) => r && { ...r, y: r.y + (stackOffset.get(file) ?? 0) };
          let compared = 0;
          for (const n of game.nodes) {
            const e = byId.get(n.id);
            if (!e) continue;
            compared++;
            const file = n.id.slice(0, n.id.indexOf('#'));
            expect({ id: n.id, rect: n.rect, clip: n.clip }).toEqual({
              id: e.id,
              rect: shifted(e.rect, file),
              clip: shifted(e.clip, file),
            });
          }
          expect(compared).toBe(game.nodes.length);
          // Same paint order as the editor for the panels both draw.
          const order = editor.nodes
            .map((n) => n.id)
            .filter((id) => game.nodes.some((g) => g.id === id));
          expect(game.nodes.map((n) => n.id)).toEqual(order);
        });
      }
    }
  }

  it('the sample HUDs really move panels (the comparison is not vacuous)', () => {
    const s = SCENARIOS.medicPayload();
    const rect = (hud: Hud, id: string) =>
      inGame(hud, s, SCREENS[0]).scene.nodes.find((n) => n.id === id)?.rect;
    const id = 'resource/ui/hudplayerhealth.res#HudPlayerHealth';
    expect(rect(HUDS[1], id)).not.toEqual(rect(HUDS[0], id));
    expect(rect(HUDS[1], id)).toEqual({ x: 308, y: 777, w: 562, h: 270 });
  });
});

describe('touch controls reserve', () => {
  const screen = { w: 852, h: 372 };
  it('moves a panel that sits under a touch button up above it, never off the top', () => {
    const fire = { x: 700, y: 150, w: 76, h: 76 };
    const jump = { x: 760, y: 300, w: 66, h: 66 };
    // Above the jump button it rests on (the fire button is further left and higher).
    expect(clearOfReserve({ x: 760, y: 300, w: 80, h: 40 }, [fire, jump], screen)).toBe(300 - 6 - 340);
    // Over two buttons: above the higher one.
    expect(clearOfReserve({ x: 740, y: 300, w: 80, h: 40 }, [{ ...fire, y: 230 }, jump], screen)).toBe(230 - 6 - 340);
    // Moved above one, it would land on another: above that one too.
    expect(clearOfReserve({ x: 760, y: 300, w: 80, h: 40 }, [{ ...fire, x: 750, y: 220 }, jump], screen)).toBe(220 - 6 - 340);
    expect(clearOfReserve({ x: 10, y: 300, w: 80, h: 40 }, [fire, jump], screen)).toBe(0);
    expect(clearOfReserve({ x: 600, y: 300, w: 80, h: 40 }, [fire, jump], screen)).toBe(0);
    expect(clearOfReserve({ x: 760, y: 20, w: 80, h: 160 }, [{ ...fire, y: 40 }], screen)).toBe(-20);
    // A container spanning half the screen is not moved.
    expect(clearOfReserve({ x: 600, y: 100, w: 200, h: 250 }, [fire], screen)).toBe(0);
    expect(clearOfReserve({ x: 760, y: 300, w: 80, h: 40 }, null, screen)).toBe(0);
  });

  it("lifts the base HUD's ammo above a phone's fire cluster and leaves the health panel", () => {
    const s = SCENARIOS.soldierCp();
    const test = toTestState(s);
    const input = (reserve: Array<{ x: number; y: number; w: number; h: number }> | null) => ({
      files: inGameFiles(s, test),
      test,
      vars: liveVars(s, test),
      bindings: bindingsFor(s, test),
      screen,
      reserve,
    });
    const scene = new InGameScene(sourceOf(HUDS[0]));
    const before = scene.build(input(null)).scene;
    const reserve = { x: 560, y: 150, w: 292, h: 222 };
    const after = scene.build(input([reserve]));
    const ammo = 'resource/ui/hudammoweapons.res#HudWeaponAmmoBG';
    const health = 'resource/ui/hudplayerhealth.res#HudPlayerHealth';
    const rect = (sc: Scene, id: string) => sc.nodes.find((n) => n.id === id)?.rect;
    expect(rect(before, ammo)!.y + rect(before, ammo)!.h).toBeGreaterThan(reserve.y);
    expect(rect(after.scene, ammo)!.y + rect(after.scene, ammo)!.h).toBeLessThanOrEqual(reserve.y - 6);
    expect(rect(after.scene, health)).toEqual(rect(before, health));
    expect(after.dirty.length).toBeGreaterThan(0);
  });
});

describe('incremental rebuilds', () => {
  it('a health change rebuilds only the health file; an unchanged state rebuilds nothing', () => {
    const scene = new InGameScene(sourceOf(HUDS[0]));
    const a = SCENARIOS.soldierCp();
    const first = inGame(HUDS[0], a, SCREENS[0], scene);
    expect(first.rebuilt).toBeGreaterThan(1);
    expect(inGame(HUDS[0], { ...a, now: a.now + 0.05 }, SCREENS[0], scene).rebuilt).toBe(0);
    const hurt = { ...a, local: { ...a.local!, health: 90 } };
    const r = inGame(HUDS[0], hurt, SCREENS[0], scene);
    expect(r.rebuilt).toBe(1);
    expect(r.dirty.length).toBeGreaterThan(0);
    // The incremental scene is the full build.
    const full = inGame(HUDS[0], hurt, SCREENS[0], new InGameScene(sourceOf(HUDS[0]))).scene;
    expect(r.scene.nodes.map((n) => [n.id, n.rect, n.shown, n.ops.length])).toEqual(
      full.nodes.map((n) => [n.id, n.rect, n.shown, n.ops.length]),
    );
  });

  it('labels show the live numbers', () => {
    const s = SCENARIOS.sniperKoth();
    const nodes = inGame(HUDS[0], s, SCREENS[0]).scene.nodes;
    const text = (id: string) => nodes.find((n) => n.id === id)?.ops.find((o) => o.t === 'text');
    expect(text('resource/ui/hudplayerhealth.res#PlayerStatusHealthValue')).toMatchObject({
      text: String(s.local!.health),
    });
    const koth = nodes
      .filter((n) => n.name === 'TimePanelValue')
      .map((n) => n.ops.find((o) => o.t === 'text'));
    expect(koth.map((o) => (o && o.t === 'text' ? o.text : ''))).toEqual([
      `${Math.floor(Math.ceil(s.match.koth!.blue) / 60)}:${String(Math.ceil(s.match.koth!.blue) % 60).padStart(2, '0')}`,
      `${Math.floor(Math.ceil(s.match.koth!.red) / 60)}:${String(Math.ceil(s.match.koth!.red) % 60).padStart(2, '0')}`,
    ]);
  });
});

/* ─────────────────────────── the game's own panels ─────────────────────────── */

const DOM_ELEMENTS = Object.keys(TF2_LAYOUT);

function layoutFor(hud: Hud): HudLayout {
  return mergeLayout(TF2_LAYOUT, layoutOverrides(hud.read, PC_ENV, DOM_ELEMENTS));
}

describe('panels the game draws follow the HUD’s hudlayout.res', () => {
  // The elements the editor previews as frames, and their files.
  const FRAMES: Array<[string, string]> = [
    ['HudWeaponAmmo', 'resource/ui/hudammoweapons.res'],
    ['HudMedicCharge', 'resource/ui/hudmediccharge.res'],
    ['HudItemEffectMeter', 'resource/ui/huditemeffectmeter.res'],
    ['HudDemomanPipes', 'resource/ui/huddemomanpipes.res'],
    ['HudDemomanCharge', 'resource/ui/huddemomancharge.res'],
    ['HudKothTimeStatus', 'resource/ui/hudobjectivekothtimepanel.res'],
    ['DisguiseStatus', 'resource/ui/disguisestatuspanel.res'],
    ['WinPanel', 'resource/ui/winpanel.res'],
    ['HudTeamGoal', 'resource/ui/hudteamgoal.res'],
    ['FreezePanel', 'resource/ui/freezepanel_basic.res'],
  ];
  for (const hud of HUDS) {
    for (const screen of SCREENS) {
      it(`${hud.name} · ${screen.w}×${screen.h}`, () => {
        const layout = hud.name === 'base' ? TF2_LAYOUT : layoutFor(hud);
        const test = toTestState(SCENARIOS.soldierCp());
        for (const [name, file] of FRAMES) {
          const frame = editorScene(hud, test, [file], screen).nodes.find((n) => n.isFrame);
          expect(frame, name).toBeDefined();
          const r = resolvePanel(layout[name], screen);
          expect({ name, x: r.left, y: r.top, w: r.width, h: r.height }).toEqual({
            name,
            ...frame!.rect,
          });
        }
        // The health panel's own block (it is not in hudlayout.res).
        const health = editorScene(hud, test, ['resource/ui/hudplayerhealth.res'], screen).nodes[0];
        if (hud.name === 'base') {
          const r = resolvePanel(TF2_LAYOUT.HudPlayerHealth, screen);
          expect({ x: r.left, y: r.top, w: r.width, h: r.height }).toEqual(health.rect);
        }
      });
    }
  }

  it('moves the kill feed and chat with the HUD', () => {
    const moved = layoutFor(HUDS[1]);
    expect(moved.HudDeathNotice.ypos).toBe('40');
    expect(layoutFor(HUDS[2]).HudChat.ypos).toBe('200');
    expect(layoutFor(HUDS[0])).toEqual(
      mergeLayout(TF2_LAYOUT, layoutOverrides(readBase, PC_ENV, DOM_ELEMENTS)),
    );
  });
});

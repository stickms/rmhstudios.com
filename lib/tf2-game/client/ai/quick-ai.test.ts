/**
 * The in-game quick AI bars' pure half: the local HUD presets (valid change sets that apply through the
 * assistant's validator and undo as one history step), which chips each class / device gets, the match
 * context the loadout assistant is sent (capped, no player names), the HUD note, the death log, the
 * loadout equips under the game's rules, and the signed-out / AI-unavailable fallbacks.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyChanges } from '@/lib/tf2-hud/ai-core';
import { AI_CONTEXT_LIMIT } from '@/lib/tf2-hud/ai-context';
import { parseKv } from '@/lib/tf2-hud/kv/parse';
import { kvAt } from '@/lib/tf2-hud/kv/query';
import { DEFAULT_META } from '@/lib/tf2-hud/project/types';
import { useEditor } from '@/lib/tf2-hud/store';
import { heuristicSuggest, MATCH_CONTEXT_LIMITS } from '@/lib/tf2-loadout/ai-core';
import { TF_CLASSES, type Catalog, type CatalogItem } from '@/lib/tf2-loadout/catalog-types';
import { emptyHudState, emptyAmmo, emptyConditions, emptyMeters, type HudKillEntry, type HudLocalPlayer, type HudScoreRow, type HudState } from '../hud-state';
import {
  AMMO_FILE,
  biggerFont,
  HEALTH_FILE,
  HUD_PRESET_IDS,
  HUDLAYOUT,
  PRESET_FILES,
  presetChanges,
  SCHEME_FILE,
  TOUCH_LIFT,
  type HudPresetId,
} from './hud-presets';
import { applyLoadoutActions } from './loadout-quick';
import { DEATH_LOG_MAX, hudQuickContext, matchContextFrom, noteDeaths, summariseDeaths } from './match-context';
import { hudSuggestions, localPresetSuggestions, loadoutSuggestions } from './suggestions';

const BASE = path.resolve(import.meta.dirname, '../../../../public/tf2-hud/base');
const read = (p: string) => readFileSync(path.join(BASE, p), 'utf8');
const filesFor = (id: HudPresetId): Record<string, string> =>
  Object.fromEntries(PRESET_FILES[id].map((p) => [p, read(p)]));
const errors = (text: string) => parseKv(text).diagnostics.filter((d) => d.severity === 'error').length;

describe('local HUD presets', () => {
  for (const id of HUD_PRESET_IDS) {
    it(`${id}: valid changes that all apply to the TF2 Default and keep every file parsing`, () => {
      const files = filesFor(id);
      const changes = presetChanges(id, files);
      expect(changes.length).toBeGreaterThan(0);
      const r = applyChanges(files, changes);
      expect(r.rejected).toEqual([]);
      expect(r.applied).toHaveLength(changes.length);
      for (const [p, text] of Object.entries(r.files)) expect(errors(text)).toBe(errors(files[p]));
      // Only existing panels are touched (a preset never invents a block).
      for (const c of changes) expect(kvAt(parseKv(files[c.file]), c.path.slice(0, -1))?.open).toBeTruthy();
      // Deterministic.
      expect(presetChanges(id, files)).toEqual(changes);
    });
  }

  it('bigger health scales the cluster about its bottom-left anchor and takes a bigger font of the same face', () => {
    const files = filesFor('bigger-health');
    const r = applyChanges(files, presetChanges('bigger-health', files));
    const doc = parseKv(r.files[HEALTH_FILE]);
    const root = 'Resource/UI/HudPlayerHealth.res';
    expect(kvAt(doc, [root, 'HudPlayerHealth', 'ypos'])?.value?.text).toBe('r162');
    expect(kvAt(doc, [root, 'HudPlayerHealth', 'tall'])?.value?.text).toBe('162');
    expect(kvAt(doc, [root, 'PlayerStatusHealthValue', 'font'])?.value?.text).not.toBe('HudClassHealth');
  });

  it('picks fonts only from the HUD scheme and only in the same face', () => {
    const scheme = read(SCHEME_FILE);
    expect(biggerFont(scheme, 'HudFontMediumSmall', 1.25)).toBe('HudFontGiant');
    // TF2 Build 44 → nothing within reach in that face: the font is left alone.
    expect(biggerFont(scheme, 'HudFontGiantBold', 1.25)).toBeNull();
    expect(biggerFont(undefined, 'HudFontGiant', 1.25)).toBeNull();
  });

  it('touches only what a custom HUD has, and lifts the touch cluster once', () => {
    const hudlayout = '"Resource/HudLayout.res"\n{\n\tHudWeaponAmmo\n\t{\n\t\t"xpos" "r95"\n\t\t"ypos" "r55"\n\t}\n}\n';
    const changes = presetChanges('clear-touch', { [HUDLAYOUT]: hudlayout });
    expect(changes).toEqual([
      { file: HUDLAYOUT, op: 'set', path: ['Resource/HudLayout.res', 'HudWeaponAmmo', 'ypos'], value: `r${55 + TOUCH_LIFT}` },
    ]);
    const once = applyChanges({ [HUDLAYOUT]: hudlayout }, changes).files[HUDLAYOUT];
    expect(presetChanges('clear-touch', { [HUDLAYOUT]: once })).toEqual([]);
    expect(presetChanges('minimal', {})).toEqual([]);
    expect(presetChanges('bigger-ammo', { [AMMO_FILE]: '"x"\n{\n}\n' })).toEqual([]);
  });

  it('applies as ONE editor history step and undoes back to the previous revision', () => {
    const ed = useEditor.getState();
    ed.loadProject({ meta: { ...DEFAULT_META }, overlay: new Map() });
    const before = useEditor.getState().overlay;
    const files = filesFor('minimal');
    const done = applyChanges(files, presetChanges('minimal', files));
    useEditor.getState().applyBatch('AI: Minimal competitive HUD', done.files);
    const after = useEditor.getState();
    expect(after.past).toHaveLength(1);
    expect([...after.overlay.keys()].sort()).toEqual(Object.keys(done.files).sort());
    after.undo();
    expect(useEditor.getState().overlay).toBe(before);
  });
});

describe('HUD suggestion chips', () => {
  const base = { weapon: null, touch: false, aspect: 16 / 9 };
  it('lead with the class: Medic Über, Sniper charge (bow charge with the Huntsman), Demoman stickies, Spy cloak', () => {
    expect(hudSuggestions({ ...base, cls: 5 })[0]).toMatchObject({ id: 'medic-uber', preset: 'bigger-uber' });
    expect(hudSuggestions({ ...base, cls: 2, weapon: 'Sniper Rifle' })[0].id).toBe('sniper-charge');
    expect(hudSuggestions({ ...base, cls: 2, weapon: 'The Huntsman' })[0].id).toBe('bow-charge');
    expect(hudSuggestions({ ...base, cls: 4 })[0].id).toBe('demo-stickies');
    expect(hudSuggestions({ ...base, cls: 8 })[0].id).toBe('spy-cloak');
    expect(hudSuggestions({ ...base, cls: 3 })[0].id).toBe('bigger-health');
    expect(hudSuggestions({ ...base, cls: 0 }).map((s) => s.id)).toEqual(['bigger-health', 'ammo-crosshair', 'minimal', 'bigger-ammo']);
  });

  it('follow the device: touch buttons on a phone, the edges on an ultrawide; never more than the cap', () => {
    const phone = hudSuggestions({ ...base, cls: 5, touch: true, aspect: 844 / 390 });
    expect(phone.slice(0, 2).map((s) => s.id)).toEqual(['medic-uber', 'touch-clear']);
    expect(hudSuggestions({ ...base, cls: 3, aspect: 21 / 9 }).map((s) => s.id)).toContain('ultrawide');
    expect(hudSuggestions({ ...base, cls: 5, touch: true, aspect: 3 }, 3)).toHaveLength(3);
  });

  it('signed out: only chips with a local preset, one per preset', () => {
    const chips = localPresetSuggestions({ ...base, cls: 2, touch: true, aspect: 2.4 });
    expect(chips.every((c) => c.preset)).toBe(true);
    expect(new Set(chips.map((c) => c.preset)).size).toBe(chips.length);
    expect(chips.map((c) => c.id)).not.toContain('ultrawide');
    expect(chips[0].preset).toBe('meters-centre');
  });

  it('every chip with a preset (the AI-unavailable fallback) has one that changes the TF2 Default', () => {
    for (const cls of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      for (const s of hudSuggestions({ cls, weapon: null, touch: true, aspect: 2.4 }, 99)) {
        if (!s.preset) continue;
        expect(presetChanges(s.preset, filesFor(s.preset)).length).toBeGreaterThan(0);
      }
    }
  });
});

// ─── Match context ─────────────────────────────────────────────────────────

const player = (over: Partial<HudLocalPlayer> = {}): HudLocalPlayer => ({
  id: 1,
  name: 'Me Myself',
  team: 2,
  cls: 3,
  alive: true,
  health: 200,
  maxHealth: 200,
  maxBuffedHealth: 300,
  ammo: emptyAmmo(),
  activeSlot: 0,
  activeWeapon: null,
  slots: [],
  meters: emptyMeters(),
  conditions: emptyConditions(),
  engineer: null,
  respawnIn: null,
  spectating: null,
  ...over,
});
const row = (id: number, team: number, cls: number, name = `Player ${id}`): HudScoreRow => ({
  id,
  name,
  team,
  cls,
  score: 0,
  kills: 0,
  deaths: 0,
  assists: 0,
  ping: 0,
  dead: false,
  bot: false,
  isLocal: id === 1,
  dominated: false,
  nemesis: false,
});
const kill = (id: number, attacker: number, weaponName: string, victim = 1): HudKillEntry => ({
  id,
  at: 0,
  attacker: { id: attacker, name: `Killer ${attacker}`, team: 3 },
  assister: null,
  victim: { id: victim, name: 'Me Myself', team: 2 },
  icon: 'x',
  weaponName,
  crit: 0,
  customKill: 0,
  domination: false,
  revenge: false,
  involvesLocal: victim === 1,
});
function match(): HudState {
  const s = emptyHudState();
  s.local = player();
  s.match = { ...s.match, map: 'ctf_2fort', mode: 'ctf', roundState: 'running' };
  s.scoreboard = [
    row(1, 2, 3, 'Me Myself'),
    row(2, 2, 5),
    row(10, 3, 2, 'Sniper Steve'),
    row(11, 3, 2),
    row(12, 3, 8),
    row(13, 1, 4),
  ];
  s.killfeed = [kill(100, 10, 'Sniper Rifle'), kill(101, 12, 'Knife'), kill(102, 10, 'Sniper Rifle'), kill(103, 10, 'Sniper Rifle', 2)];
  return s;
}

describe('match context for the loadout assistant', () => {
  it('counts the enemy team from the scoreboard and what killed you, with no player names', () => {
    const ctx = matchContextFrom(match());
    expect(ctx).toEqual({
      map: 'ctf_2fort',
      mode: 'ctf',
      round: 'running',
      yourClass: 'soldier',
      team: 'red',
      enemies: [
        { cls: 'sniper', n: 2 },
        { cls: 'spy', n: 1 },
      ],
      deaths: [
        { weapon: 'Sniper Rifle', cls: 'sniper', n: 2 },
        { weapon: 'Knife', cls: 'spy', n: 1 },
      ],
    });
    const json = JSON.stringify(ctx);
    for (const name of ['Me Myself', 'Sniper Steve', 'Killer']) expect(json).not.toContain(name);
  });

  it('caps and cleans what it sends', () => {
    const s = match();
    s.match.map = `<x>map\u0000\n${'a'.repeat(200)}`;
    s.scoreboard = Array.from({ length: 40 }, (_, i) => row(20 + i, 3, (i % 9) + 1));
    s.killfeed = Array.from({ length: 30 }, (_, i) => kill(500 + i, 20 + (i % 12), `Weapon ${i}`));
    const ctx = matchContextFrom(s);
    expect(ctx.map).not.toMatch(/[<>\n]/);
    expect(ctx.map).not.toContain('\u0000');
    expect(ctx.map!.length).toBeLessThanOrEqual(MATCH_CONTEXT_LIMITS.name);
    expect(ctx.enemies!.length).toBeLessThanOrEqual(MATCH_CONTEXT_LIMITS.enemies);
    expect(ctx.deaths!.length).toBeLessThanOrEqual(MATCH_CONTEXT_LIMITS.deaths);
    expect(matchContextFrom(emptyHudState())).toEqual({ round: 'pregame' });
  });

  it('keeps a death log past the kill feed: deduplicated, the same array when nothing is new, capped', () => {
    const s = match();
    const log = noteDeaths([], s);
    expect(log.map((d) => d.id)).toEqual([100, 101, 102]);
    expect(noteDeaths(log, s)).toBe(log);
    s.killfeed = [];
    expect(matchContextFrom(s, log).deaths?.[0]).toEqual({ weapon: 'Sniper Rifle', cls: 'sniper', n: 2 });
    let big: ReturnType<typeof noteDeaths> = [];
    for (let i = 0; i < 50; i++) {
      s.killfeed = [kill(1000 + i, 10, 'Sniper Rifle')];
      big = noteDeaths(big, s);
    }
    expect(big).toHaveLength(DEATH_LOG_MAX);
    expect(summariseDeaths(big)).toEqual([{ weapon: 'Sniper Rifle', cls: 'sniper', n: DEATH_LOG_MAX }]);
  });

  it('the HUD note names the class, weapon, screen and touch buttons, capped, nothing else', () => {
    const note = hudQuickContext({ cls: 5, weapon: 'Medi Gun\u0007', screen: { w: 844, h: 390 }, touch: true });
    expect(note).toContain('Medic');
    expect(note).toContain('Medi Gun');
    expect(note).not.toContain('\u0007');
    expect(note).toContain('844x390');
    expect(note).toMatch(/Touch controls are on/);
    expect(note.length).toBeLessThanOrEqual(AI_CONTEXT_LIMIT);
    expect(hudQuickContext({ cls: 0, screen: { w: 1920, h: 1080 }, touch: false })).not.toMatch(/Touch/);
  });
});

// ─── Loadout ───────────────────────────────────────────────────────────────

const bit = (cls: (typeof TF_CLASSES)[number]) => 1 << TF_CLASSES.indexOf(cls);
const item = (id: number, n: string, over: Partial<CatalogItem>): CatalogItem => ({
  id,
  n,
  t: 'x',
  q: 'unique',
  s: 'misc',
  c: 0b111111111,
  ...over,
});
const catalog: Catalog = {
  v: 1,
  source: { label: 't', hash: 'h', builtAt: '', hasIcons: false },
  items: [
    item(18, 'Rocket Launcher', { s: 'primary', c: bit('soldier') }),
    item(237, 'Rocket Jumper', { s: 'primary', c: bit('soldier') }),
    item(133, 'Gunboats', { s: 'secondary', c: bit('soldier') }),
    item(100, 'Festive Hat', { s: 'head', r: ['hat'], p: 1 }),
    item(101, 'Pumpkin Mask', { s: 'head', r: ['hat', 'face'] }),
  ],
  paints: [{ id: 5000, n: 'Team Spirit', rgb: '#ff0000' }],
  effects: [],
  conflicts: { hat: ['face'], face: ['hat'] },
};

describe('loadout chips and equips', () => {
  it('chips come from the match: a weapon that killed you twice, their main class, a jump set, the map', () => {
    const ctx = matchContextFrom(match());
    const chips = loadoutSuggestions('soldier', ctx);
    expect(chips.map((c) => c.id)).toEqual(['counter-weapon', 'counter-class', 'jump-set', 'map']);
    expect(chips[0].params).toEqual({ weapon: 'Sniper Rifle' });
    expect(chips[1].params).toEqual({ cls: 'sniper' });
    expect(loadoutSuggestions('medic', {}).map((c) => c.id)).toEqual(['festive', 'spooky']);
    expect(loadoutSuggestions('soldier', { deaths: [{ weapon: 'Knife', n: 1 }] }).map((c) => c.id)).not.toContain('counter-weapon');
  });

  it('signed out (or the AI unavailable), a chip answers from item names with its own words', () => {
    const jump = loadoutSuggestions('soldier', {}).find((c) => c.id === 'jump-set')!;
    const r = heuristicSuggest(catalog, 'soldier', `Rocket-jump set ${jump.localWords}`, {});
    expect(r.matched).toEqual(expect.arrayContaining(['Rocket Jumper', 'Gunboats']));
    const festive = loadoutSuggestions('soldier', {}).find((c) => c.id === 'festive')!;
    expect(heuristicSuggest(catalog, 'soldier', festive.localWords, {}).matched).toEqual(['Festive Hat']);
    // Chips that only the AI can answer carry no words, so the signed-out bar hides them.
    expect(loadoutSuggestions('soldier', matchContextFrom(match())).filter((c) => !c.localWords).map((c) => c.id)).toEqual(['counter-weapon', 'map']);
  });

  it('equips under the game rules: a clashing cosmetic is replaced, unknown items are skipped', () => {
    const start = { primary: { item: 18 }, cosmetic1: { item: 101 } };
    const r = applyLoadoutActions(catalog, start, [
      { slot: 'primary', item: 237 },
      { slot: 'cosmetic2', item: 100, paint: 5000 },
      { slot: 'secondary', item: 99999 },
    ]);
    expect(r.equipped).toEqual(['Rocket Jumper', 'Festive Hat']);
    expect(r.replaced).toEqual(['Pumpkin Mask']);
    expect(r.slots).toEqual({ primary: { item: 237 }, cosmetic2: { item: 100, paint: 5000 } });
    expect(start).toEqual({ primary: { item: 18 }, cosmetic1: { item: 101 } });
  });
});

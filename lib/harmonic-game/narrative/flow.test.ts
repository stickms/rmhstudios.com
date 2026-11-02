import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Driver } from '../../sp-game/sp-driver.test-support';
import { SpWorld } from '../../sp-game/world/sp-world';
import { HARMONIC_MATERIAL_LOOKUP, createHarmonicAssets } from '../assets';
import { compileLevel } from '../compiler';
import { ChapterFlow, CARD_S, CURTAIN_MS } from '../client/flow';
import {
  HARMONIC_SAVE_VERSION,
  readHarmonicSave,
  writeHarmonicSave,
  type SaveStorage,
} from '../client/save';
import { HARMONIC_LEVELS } from '../levels';
import { devFlowASource } from '../levels/dev_flow';
import {
  ALL_ENDING_LINES,
  ENDINGS,
  FlagService,
  HARMONIC_CHAPTERS,
  HARMONIC_DEV_CHAPTERS,
  HARMONIC_FLAGS,
  chapterById,
  endingLines,
  epilogueLevel,
  flowCommand,
  furthestChapter,
  getFlags,
  noteChapterReached,
  nextChapter,
  parseFlagValue,
  parseFlowCommand,
  setDefaultFlagStorage,
} from './index';
import '../sim';

function memory(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

let store: ReturnType<typeof memory>;
beforeEach(() => {
  store = memory();
  setDefaultFlagStorage(store);
});
afterEach(() => setDefaultFlagStorage(undefined));

async function load(mapName = 'dev_flow_a', saved?: Record<string, boolean | string | number>) {
  if (saved)
    writeHarmonicSave(
      { v: HARMONIC_SAVE_VERSION, level: mapName, flags: saved, savedAt: 1 },
      store,
    );
  const level = compileLevel(devFlowASource(), { materials: HARMONIC_MATERIAL_LOOKUP });
  const world = await SpWorld.create({
    game: 'hl2',
    mapName,
    bsp: level.bsp,
    assets: createHarmonicAssets(),
  });
  const d = new Driver(world);
  d.idle(0.2);
  return { world, d };
}

const commands = (d: Driver) =>
  d.events.filter((e) => e.type === 'clientcommand').map((e) => (e as { command: string }).command);

describe('flag schema and service', () => {
  it('has the story flags with typed defaults', () => {
    expect(HARMONIC_FLAGS.sanaHelped).toEqual({ type: 'boolean', default: false });
    expect(HARMONIC_FLAGS.vossSpared).toEqual({ type: 'boolean', default: false });
    expect(HARMONIC_FLAGS.ending.default).toBe('');
    expect(HARMONIC_FLAGS.ending.values).toEqual(['', 'anchor', 'release', 'silence']);
  });

  it('sets and gets; rejects unknown names and wrong types', () => {
    const f = new FlagService({}, store);
    expect(f.get('sanaHelped')).toBe(false);
    expect(f.set('sanaHelped', true)).toBe(true);
    expect(f.get('sanaHelped')).toBe(true);
    expect(f.set('sanaHelped', 'yes')).toBe(false);
    expect(f.set('nope', true)).toBe(false);
    expect(f.set('ending', 'chaos')).toBe(false);
    expect(f.get('ending')).toBe('');
    expect(parseFlagValue('sanaHelped', '1')).toBe(true);
    expect(parseFlagValue('ending', 'anchor')).toBe('anchor');
    expect(parseFlagValue('ending', 'x')).toBeUndefined();
  });

  it('persists into the save and restores on a fresh service', () => {
    const f = new FlagService({}, store);
    f.set('vossSpared', true);
    f.set('ending', 'silence');
    expect(f.persist('h6_drive_room', 123)).toBe(true);
    const save = readHarmonicSave(store)!;
    expect(save).toMatchObject({ level: 'h6_drive_room', savedAt: 123 });
    expect(save.flags).toMatchObject({ vossSpared: true, ending: 'silence', sanaHelped: false });
    expect(save.flags.chapterReached).toBe(6);
    const g = new FlagService(save.flags, store);
    expect(g.get('vossSpared')).toBe(true);
    expect(g.get('ending')).toBe('silence');
  });

  it('ignores junk in a save and keeps unknown keys on persist', () => {
    writeHarmonicSave(
      {
        v: HARMONIC_SAVE_VERSION,
        level: 'dev_box',
        flags: { ending: 'chaos', future: 7 },
        savedAt: 1,
      },
      store,
    );
    const f = new FlagService(readHarmonicSave(store)!.flags, store);
    expect(f.get('ending')).toBe('');
    f.persist('dev_box');
    expect(readHarmonicSave(store)!.flags.future).toBe(7);
  });

  it('a death reload forgets what the attempt set', () => {
    const f = new FlagService({ sanaHelped: true }, store);
    f.set('vossSpared', true);
    f.restoreLevelStart();
    expect(f.get('vossSpared')).toBe(false);
    expect(f.get('sanaHelped')).toBe(true);
  });

  it('noteChapterReached only raises the furthest chapter', () => {
    writeHarmonicSave(
      { v: HARMONIC_SAVE_VERSION, level: 'h3_still_point', flags: {}, savedAt: 1 },
      store,
    );
    noteChapterReached('h3_still_point', store);
    expect(furthestChapter(readHarmonicSave(store)!.flags)).toBe(3);
    noteChapterReached('h1_whiteout', store);
    expect(furthestChapter(readHarmonicSave(store)!.flags)).toBe(3);
    noteChapterReached('dev_box', store);
    expect(furthestChapter(readHarmonicSave(store)!.flags)).toBe(3);
  });
});

describe('harmonic_flag', () => {
  it('Test fires OnFalse then OnTrue for a boolean', async () => {
    const { world, d } = await load();
    world.fireInput('dev_flag', 'Test');
    d.idle(0.1);
    expect(d.fired('dev_false.trigger')).toBe(true);
    expect(d.fired('dev_true.trigger')).toBe(false);
    world.fireInput('dev_flag', 'Set', '1');
    world.fireInput('dev_flag', 'Test');
    d.idle(0.1);
    expect(d.fired('dev_true.trigger')).toBe(true);
    expect(getFlags(world).get('devSwitch')).toBe(true);
  });

  it('Set <name> <value> and an enum Test fires OnValue<value>', async () => {
    const { world, d } = await load();
    world.fireInput('dev_mood', 'Test');
    d.idle(0.1);
    expect(d.fired('dev_calm.trigger')).toBe(true);
    world.fireInput('dev_mood', 'Set', 'devMood alarm');
    world.fireInput('dev_mood', 'Test');
    d.idle(0.1);
    expect(d.fired('dev_alarm.trigger')).toBe(true);
    world.fireInput('dev_mood', 'Set', 'devMood nonsense'); // ignored
    expect(getFlags(world).get('devMood')).toBe('alarm');
  });

  it('starts from the saved flags', async () => {
    const { world, d } = await load('dev_flow_a', { devSwitch: true });
    world.fireInput('dev_flag', 'Test');
    d.idle(0.1);
    expect(d.fired('dev_true.trigger')).toBe(true);
  });
});

describe('harmonic_chapter_end', () => {
  it('saves the flags with the next chapter and asks the client to load it', async () => {
    const { world, d } = await load('dev_flow_a');
    expect(HARMONIC_LEVELS.some((l) => l.id === 'dev_flow_b')).toBe(true);
    world.fireInput('dev_flag', 'Set', '1');
    world.fireInput('dev_chapter_end', 'End');
    d.idle(0.1);
    expect(d.fired('dev_ended.trigger')).toBe(true);
    expect(commands(d)).toEqual([flowCommand('dev_flow_b')]);
    const save = readHarmonicSave(store)!;
    expect(save.level).toBe('dev_flow_b');
    expect(save.flags.devSwitch).toBe(true);
    expect(save.flags.chapterReached).toBe(2);
    // A second End does nothing.
    world.fireInput('dev_chapter_end', 'End');
    d.idle(0.1);
    expect(commands(d)).toHaveLength(1);
  });

  it('the trigger at the end of the hall ends the chapter (set flag first)', async () => {
    const { world, d } = await load('dev_flow_a');
    expect(d.walkTo({ x: 450, y: 128, z: 1 }, { radius: 8 }).reached).toBe(true);
    d.idle(0.5);
    expect(getFlags(world).get('devSwitch')).toBe(true);
    expect(commands(d)).toEqual([flowCommand('dev_flow_b')]);
  });

  it('a missing next chapter (or none) becomes the end of the build', async () => {
    const { world, d } = await load('dev_flow_b'); // no chapter after dev_flow_b
    world.fireInput('dev_chapter_end', 'End');
    d.idle(0.1);
    expect(commands(d)).toEqual([flowCommand(null)]);
    expect(readHarmonicSave(store)!.level).toBe('dev_flow_b');

    // The last real chapter has no successor either.
    const last = await load('h7_harmonic');
    last.world.fireInput('dev_chapter_end', 'End');
    last.d.idle(0.1);
    expect(commands(last.d)).toEqual([flowCommand(null)]);
  });

  it('a next chapter without a source yet is not available', async () => {
    const id = nextChapter('h1_whiteout')!.id;
    const present = HARMONIC_LEVELS.some((l) => l.id === id);
    const { world, d } = await load('h1_whiteout');
    world.fireInput('dev_chapter_end', 'End');
    d.idle(0.1);
    expect(commands(d)).toEqual([flowCommand(present ? id : null)]);
  });
});

describe('harmonic_ending', () => {
  it('Choose sets the flag, saves and routes to the epilogue (end of build until it exists)', async () => {
    const { world, d } = await load('h7_harmonic');
    world.fireInput('dev_ending', 'Choose', 'nonsense');
    d.idle(0.1);
    expect(commands(d)).toEqual([]);
    world.fireInput('dev_ending', 'Choose', 'release');
    d.idle(0.1);
    expect(d.fired('dev_chosen.trigger')).toBe(true);
    expect(getFlags(world).get('ending')).toBe('release');
    expect(readHarmonicSave(store)!.flags.ending).toBe('release');
    const epilogue = epilogueLevel('release');
    expect(epilogue).toBe('h7_epilogue_release');
    const present = HARMONIC_LEVELS.some((l) => l.id === epilogue);
    expect(commands(d)).toEqual([flowCommand(present ? epilogue : null)]);
    // The choice is made once.
    world.fireInput('dev_ending', 'Choose', 'anchor');
    d.idle(0.1);
    expect(getFlags(world).get('ending')).toBe('release');
  });

  it('goes to the epilogue level once it has a source', async () => {
    const dev = HARMONIC_LEVELS.find((l) => l.id === 'dev_flow_b')!;
    HARMONIC_LEVELS.push({ ...dev, id: 'h7_epilogue_silence' });
    try {
      const { world, d } = await load('h7_harmonic');
      world.fireInput('dev_ending', 'Choose', 'silence');
      d.idle(0.1);
      expect(commands(d)).toEqual(['harmonic_flow goto h7_epilogue_silence']);
      expect(readHarmonicSave(store)!.level).toBe('h7_epilogue_silence');
    } finally {
      HARMONIC_LEVELS.pop();
    }
  });

  it('every ending has an epilogue id', () => {
    expect(ENDINGS.map(epilogueLevel)).toEqual([
      'h7_epilogue_anchor',
      'h7_epilogue_release',
      'h7_epilogue_silence',
    ]);
  });
});

describe('endingLines', () => {
  it('varies by flags and never by availability', () => {
    for (const e of ENDINGS) {
      const none = endingLines(e, {});
      const both = endingLines(e, { sanaHelped: true, vossSpared: true });
      expect(none).toHaveLength(3);
      expect(none[0]).toEqual(both[0]); // the base line is the same
      expect(none[1].key).toMatch(/sana_no$/);
      expect(both[1].key).toMatch(/sana_yes$/);
      expect(none[2].key).toMatch(/voss_no$/);
      expect(both[2].key).toMatch(/voss_yes$/);
      expect(endingLines(e, { sanaHelped: true })[2].key).toMatch(/voss_no$/);
    }
    expect(endingLines('anchor', {})[0].key).not.toBe(endingLines('silence', {})[0].key);
  });
});

describe('chapter order', () => {
  it('lists h1..h7 in order with numbers and the dev pair separately', () => {
    expect(HARMONIC_CHAPTERS.map((c) => c.id)).toEqual([
      'h1_whiteout',
      'h2_listening',
      'h3_still_point',
      'h4_below_decks',
      'h5_long_corridor',
      'h6_drive_room',
      'h7_harmonic',
    ]);
    expect(HARMONIC_CHAPTERS.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(nextChapter('h2_listening')?.id).toBe('h3_still_point');
    expect(nextChapter('h7_harmonic')).toBeNull();
    expect(nextChapter('dev_box')).toBeNull();
    expect(nextChapter('dev_flow_a')?.id).toBe('dev_flow_b');
    expect(chapterById('dev_flow_b')?.number).toBe(2);
    expect(HARMONIC_DEV_CHAPTERS).toHaveLength(2);
  });

  it('round-trips the client command', () => {
    expect(parseFlowCommand(flowCommand('dev_flow_b'))).toEqual({
      kind: 'goto',
      level: 'dev_flow_b',
    });
    expect(parseFlowCommand(flowCommand(null))).toEqual({ kind: 'end' });
    expect(parseFlowCommand('quit')).toBeNull();
    expect(parseFlowCommand('harmonic_flow goto ../x')).toBeNull();
  });
});

describe('ChapterFlow (client)', () => {
  function rig() {
    const timers: { fn: () => void; ms: number; live: boolean }[] = [];
    const calls: string[] = [];
    let known = new Set(['dev_flow_b']);
    const flow = new ChapterFlow({
      set: (fn, ms) => {
        const t = { fn, ms, live: true };
        timers.push(t);
        return t;
      },
      clear: (h) => {
        (h as { live: boolean }).live = false;
      },
    });
    const host = {
      loadMap: (m: string) => (known.has(m) ? (calls.push(`load:${m}`), true) : false),
      end: () => void calls.push('end'),
    };
    return {
      flow,
      host,
      calls,
      timers,
      fire: () => timers.forEach((t) => t.live && ((t.live = false), t.fn())),
      known: (s: string[]) => (known = new Set(s)),
    };
  }

  it('drops the curtain, then loads the next chapter, then shows its title card', () => {
    const r = rig();
    r.flow.handle(flowCommand('dev_flow_b'), r.host);
    expect(r.flow.readHud(0).curtain).toBe(true);
    expect(r.timers[0].ms).toBe(CURTAIN_MS);
    expect(r.calls).toEqual([]);
    r.fire();
    expect(r.calls).toEqual(['load:dev_flow_b']);
    r.flow.levelLoaded('dev_flow_b');
    const hud = r.flow.readHud(100);
    expect(hud.curtain).toBeUndefined();
    expect(hud.chapter).toMatchObject({ number: 2, titleDefault: 'Dev flow B', fading: false });
    expect(r.flow.readHud(100 + CARD_S - 0.5).chapter?.fading).toBe(true);
    expect(r.flow.readHud(100 + CARD_S + 0.1).chapter).toBeUndefined();
  });

  it('a level that cannot load ends the run; end ends it at once; others are ignored', () => {
    const r = rig();
    r.flow.handle(flowCommand('h2_listening'), r.host);
    r.fire();
    expect(r.calls).toEqual(['end']);
    r.flow.handle(flowCommand(null), r.host);
    expect(r.calls).toEqual(['end', 'end']);
    r.flow.handle('something_else', r.host);
    expect(r.calls).toHaveLength(2);
  });

  it('cancel drops a pending transition; a non-chapter level has no card', () => {
    const r = rig();
    r.flow.handle(flowCommand('dev_flow_b'), r.host);
    r.flow.cancel();
    r.fire();
    expect(r.calls).toEqual([]);
    r.flow.levelLoaded('dev_box');
    expect(r.flow.readHud(5).chapter).toBeUndefined();
  });
});

describe('catalogue', () => {
  const cat = JSON.parse(
    readFileSync(new URL('../../../locales/en/harmonic.json', import.meta.url), 'utf8'),
  ) as Record<string, string>;

  it('has every chapter title, ending line and dev level title with matching defaults', () => {
    for (const c of [...HARMONIC_CHAPTERS, ...HARMONIC_DEV_CHAPTERS])
      expect(cat[c.titleKey], c.titleKey).toBe(c.titleDefault);
    for (const l of ALL_ENDING_LINES) expect(cat[l.key], l.key).toBe(l.defaultValue);
    for (const l of HARMONIC_LEVELS.filter((x) => x.id.startsWith('dev_flow')))
      expect(cat[l.titleKey], l.titleKey).toBe(l.titleDefault);
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { propsOf } from '../kv/props';
import { kvAt } from '../kv/query';
import { buildScene, parseCached, type SceneContext } from '../scene/build';
import { PC_ENV } from '../scheme/cond';
import { parseScheme } from '../scheme/scheme';
import {
  addMembers,
  applyBlock,
  clearShared,
  driftOf,
  keyState,
  orphansOf,
  pinKey,
  removeMember,
  seedShared,
  setShared,
  unpinKey,
  type BlockOpts,
} from '../blocks/apply';
import { align, applyWrites, distribute, moveBy, planWrites, stack } from '../blocks/arrange';
import { emptyBlocksDoc, parseBlocksDoc, serializeBlocksDoc } from '../blocks/doc';
import { BLOCK_PRESETS, presetById } from '../blocks/presets';
import { globToRegExp, listPanels, resolveRule } from '../blocks/rule';
import { suggestSimilar } from '../blocks/suggest';
import type { Block } from '../blocks/types';

const BASE = path.resolve(__dirname, '../../../public/tf2-hud/base');
const baseRead = (p: string): string | undefined => {
  try {
    return readFileSync(path.join(BASE, p), 'utf8');
  } catch {
    return undefined;
  }
};
const opts: BlockOpts = { env: PC_ENV };

/** An in-memory project over a few synthetic files. */
function project(files: Record<string, string>) {
  const store = new Map(Object.entries(files));
  return {
    io: { read: (p: string) => store.get(p) },
    write: (changed: Record<string, string>) => {
      for (const [p, t] of Object.entries(changed)) store.set(p, t);
    },
    get: (p: string) => store.get(p)!,
  };
}

const bar = (name: string, extra = '') => `
	"${name}"
	{
		"ControlName"	"ContinuousProgressBar"
		"fieldName"	"${name}"
		"xpos"	"0"
		"ypos"	"0"
		"wide"	"60"
		"tall"	"8"
		"fgcolor_override"	"Red"
		${extra}
	}`;
const FILE_A = `"Resource/UI/A.res"\n{${bar('One')}${bar('Two', '"border" "Mine"')}\n}\n`;
const FILE_B = `"Resource/UI/B.res"\n{${bar('Three')}\n}\n`;

const block = (over: Partial<Block> = {}): Block => ({
  id: 'b1',
  name: 'Bars',
  members: [
    { file: 'resource/ui/a.res', path: ['Resource/UI/A.res', 'One'], pinned: [] },
    { file: 'resource/ui/a.res', path: ['Resource/UI/A.res', 'Two'], pinned: [] },
    { file: 'resource/ui/b.res', path: ['Resource/UI/B.res', 'Three'], pinned: [] },
  ],
  shared: { fgcolor_override: 'Blue', wide: '100' },
  ...over,
});

const valueOf = (text: string, p: string[], key: string, o = opts) =>
  propsOf(kvAt(parseCached(text), p)!, { env: o.env, minmode: o.minmode }).get(key);

describe('blocks sidecar', () => {
  it('round-trips and survives garbage', () => {
    const doc = {
      version: 1 as const,
      blocks: [block({ rule: { files: ['x*.res'], controls: ['label'] } })],
    };
    expect(parseBlocksDoc(serializeBlocksDoc(doc))).toEqual(doc);
    expect(parseBlocksDoc('not json')).toEqual(emptyBlocksDoc());
    expect(parseBlocksDoc(undefined)).toEqual(emptyBlocksDoc());
    expect(parseBlocksDoc('{"blocks":[{"id":1}]}').blocks).toEqual([]);
  });

  it('drops keys a block cannot hold and duplicate ids', () => {
    const text = JSON.stringify({
      blocks: [
        { id: 'a', name: 'A', members: [], shared: { xpos: '5', wide: '9' } },
        { id: 'a', name: 'dup', members: [], shared: {} },
      ],
    });
    const parsed = parseBlocksDoc(text);
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0].shared).toEqual({ wide: '9' });
  });
});

describe('rules and presets', () => {
  it('globs within one path segment', () => {
    const re = globToRegExp('resource/ui/huditemeffectmeter*.res');
    expect(re.test('resource/ui/huditemeffectmeter_pyro.res')).toBe(true);
    expect(re.test('resource/ui/sub/huditemeffectmeter.res')).toBe(false);
  });

  it('lists nested panels with their key paths', () => {
    const panels = listPanels(FILE_A, 'resource/ui/a.res', PC_ENV);
    expect(panels.map((p) => p.path)).toEqual([
      ['Resource/UI/A.res', 'One'],
      ['Resource/UI/A.res', 'Two'],
    ]);
    expect(panels[0].control).toBe('continuousprogressbar');
  });

  it('finds the charge bars of the real default HUD across several files', () => {
    const paths = readdirSync(path.join(BASE, 'resource/ui')).map((f) => `resource/ui/${f}`);
    const preset = presetById('meter-bars')!;
    const members = resolveRule(preset.rule, paths, baseRead, PC_ENV);
    const files = new Set(members.map((m) => m.file));
    expect(members.length).toBeGreaterThanOrEqual(6);
    expect(files.has('resource/ui/hudmediccharge.res')).toBe(true);
    expect(files.has('resource/ui/huddemomancharge.res')).toBe(true);
    expect(files.has('resource/ui/hudbowcharge.res')).toBe(true);
  });

  it('every preset resolves something in the default HUD', () => {
    const paths = readdirSync(path.join(BASE, 'resource/ui')).map((f) => `resource/ui/${f}`);
    for (const p of BLOCK_PRESETS) {
      expect(resolveRule(p.rule, paths, baseRead, PC_ENV).length, p.id).toBeGreaterThan(0);
    }
  });
});

describe('applyBlock', () => {
  it('writes shared values into every member and is idempotent', () => {
    const p = project({ 'resource/ui/a.res': FILE_A, 'resource/ui/b.res': FILE_B });
    const b = block();
    p.write(applyBlock(b, p.io, opts));
    for (const m of b.members) {
      expect(valueOf(p.get(m.file), m.path, 'fgcolor_override')).toBe('Blue');
      expect(valueOf(p.get(m.file), m.path, 'wide')).toBe('100');
    }
    expect(applyBlock(b, p.io, opts)).toEqual({});
  });

  it('leaves other keys and the rest of the file untouched', () => {
    const p = project({ 'resource/ui/a.res': FILE_A, 'resource/ui/b.res': FILE_B });
    p.write(applyBlock(block(), p.io, opts));
    expect(valueOf(p.get('resource/ui/a.res'), ['Resource/UI/A.res', 'Two'], 'border')).toBe(
      'Mine',
    );
    expect(valueOf(p.get('resource/ui/a.res'), ['Resource/UI/A.res', 'Two'], 'tall')).toBe('8');
  });

  it('does not write a key a member overrides, and writes it again once unpinned', () => {
    const p = project({ 'resource/ui/a.res': FILE_A, 'resource/ui/b.res': FILE_B });
    let b = block();
    b = pinKey(b, b.members[1], 'wide');
    p.write(applyBlock(b, p.io, opts));
    const two = ['Resource/UI/A.res', 'Two'];
    expect(valueOf(p.get('resource/ui/a.res'), two, 'wide')).toBe('60');
    expect(valueOf(p.get('resource/ui/a.res'), two, 'fgcolor_override')).toBe('Blue');
    expect(keyState(b, b.members[1], 'wide', p.io, opts)).toBe('override');
    b = unpinKey(b, b.members[1], 'wide');
    p.write(applyBlock(b, p.io, opts));
    expect(valueOf(p.get('resource/ui/a.res'), two, 'wide')).toBe('100');
  });

  it('edits the _minmode copy while previewing minmode and one exists', () => {
    const text = `"R.res"\n{\n"P"\n{\n"ControlName" "Panel"\n"wide" "10"\n"wide_minmode" "5"\n}\n}\n`;
    const p = project({ 'f.res': text });
    const b: Block = {
      id: 'x',
      name: 'x',
      members: [{ file: 'f.res', path: ['R.res', 'P'], pinned: [] }],
      shared: { wide: '40' },
    };
    const mm = { env: PC_ENV, minmode: true };
    p.write(applyBlock(b, p.io, mm));
    const out = p.get('f.res');
    expect(valueOf(out, ['R.res', 'P'], 'wide_minmode', opts)).toBe('40');
    expect(valueOf(out, ['R.res', 'P'], 'wide', opts)).toBe('10');
  });

  it('edits the platform copy that is live, not the first one', () => {
    const text = `"R.res"\n{\n"P"\n{\n"ControlName" "Panel"\n"wide" "10" [$X360]\n"wide" "20" [$WIN32]\n}\n}\n`;
    const p = project({ 'f.res': text });
    const b: Block = {
      id: 'x',
      name: 'x',
      members: [{ file: 'f.res', path: ['R.res', 'P'], pinned: [] }],
      shared: { wide: '33' },
    };
    p.write(applyBlock(b, p.io, opts));
    expect(p.get('f.res')).toContain('"wide" "10" [$X360]');
    expect(valueOf(p.get('f.res'), ['R.res', 'P'], 'wide')).toBe('33');
  });

  it('applies only the keys asked for', () => {
    const p = project({ 'resource/ui/a.res': FILE_A, 'resource/ui/b.res': FILE_B });
    p.write(applyBlock(block(), p.io, opts, ['wide']));
    const one = ['Resource/UI/A.res', 'One'];
    expect(valueOf(p.get('resource/ui/a.res'), one, 'wide')).toBe('100');
    expect(valueOf(p.get('resource/ui/a.res'), one, 'fgcolor_override')).toBe('Red');
  });
});

describe('drift, orphans and seeding', () => {
  it('reports hand edits as drift, never as overrides', () => {
    const p = project({ 'resource/ui/a.res': FILE_A, 'resource/ui/b.res': FILE_B });
    const b = block();
    p.write(applyBlock(b, p.io, opts));
    expect(driftOf(b, p.io, opts)).toEqual([]);
    p.write({
      'resource/ui/b.res': p.get('resource/ui/b.res').replace('"Blue"', '"Green"'),
    });
    const drift = driftOf(b, p.io, opts);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({ key: 'fgcolor_override', expected: 'Blue', actual: 'Green' });
  });

  it('finds members whose entry was renamed away', () => {
    const p = project({
      'resource/ui/a.res': FILE_A.replace('"One"', '"Uno"'),
      'resource/ui/b.res': FILE_B,
    });
    expect(orphansOf(block(), p.io, opts).map((m) => m.path[1])).toEqual(['One']);
  });

  it('seeds equal values and flags the ones members disagree on', () => {
    const p = project({ 'resource/ui/a.res': FILE_A, 'resource/ui/b.res': FILE_B });
    const { shared, mixed } = seedShared(block().members, p.io, opts);
    expect(shared).toMatchObject({ wide: '60', tall: '8', fgcolor_override: 'Red' });
    expect(mixed).not.toContain('wide');
    const solo = seedShared(block().members.slice(0, 2), p.io, opts);
    expect(solo.mixed).toEqual([]); // 'border' is set on only one: not mixed, simply not shared
    expect(solo.shared.border).toBeUndefined();
  });

  it('edits members and shared values immutably', () => {
    const b = block();
    expect(setShared(b, 'tall', '12').shared.tall).toBe('12');
    expect(b.shared.tall).toBeUndefined();
    expect(clearShared(b, 'wide').shared).toEqual({ fgcolor_override: 'Blue' });
    expect(removeMember(b, b.members[0]).members).toHaveLength(2);
    expect(addMembers(b, [b.members[0]])).toBe(b);
  });
});

/* ───────────── arrangement ───────────── */

const arrangeFile = `"Resource/UI/Row.res"
{
	"Frame"
	{
		"ControlName"	"EditablePanel"
		"fieldName"	"Frame"
		"xpos"	"100"
		"ypos"	"100"
		"wide"	"300"
		"tall"	"100"
	}
	"A" { "ControlName" "ImagePanel" "fieldName" "A" "xpos" "0" "ypos" "0" "wide" "20" "tall" "10" }
	"B" { "ControlName" "ImagePanel" "fieldName" "B" "xpos" "r40" "ypos" "30" "wide" "20" "tall" "10" }
	"C" { "ControlName" "ImagePanel" "fieldName" "C" "xpos" "100" "ypos" "60" "wide" "20" "tall" "10" }
	"Kid" { "ControlName" "Label" "fieldName" "Kid" "pin_to_sibling" "C" "xpos" "0" "ypos" "12" "wide" "20" "tall" "6" "labelText" "x" }
}
`;
const scene = (text = arrangeFile) => {
  const scheme = parseScheme('"Scheme"{"Colors"{}}', PC_ENV);
  const ctx: SceneContext = {
    readText: (p) => (p === 'resource/ui/row.res' ? text : undefined),
    scheme,
    env: PC_ENV,
    screen: { w: 960, h: 480 },
    minmode: false,
    showHidden: true,
    forceShown: new Set(),
    forceHidden: new Set(),
    vars: new Map(),
    strings: new Map(),
    progress: 0.5,
  };
  return buildScene(ctx, ['resource/ui/row.res']);
};

describe('arranging', () => {
  const s = scene();
  const by = (n: string) => s.nodes.find((x) => x.keyPath[x.keyPath.length - 1] === n)!;
  const ab = [by('A'), by('B'), by('C')];

  it('built a scene to test against', () => {
    expect(ab.every(Boolean)).toBe(true);
    expect(by('A').rect).toMatchObject({ x: 100, y: 100, w: 20, h: 10 });
  });

  it('aligns to the bounding box', () => {
    const left = align(ab, 'left');
    expect(left.get(by('B').id)!.dx).toBe(100 - by('B').rect.x);
    expect(left.get(by('A').id)!.dx).toBe(0);
    const top = align(ab, 'top');
    expect(top.get(by('C').id)!.dy).toBe(100 - by('C').rect.y);
  });

  it('distributes with equal gaps and keeps the outer two', () => {
    const d = distribute(ab, 'y');
    const ys = ab.map((n) => n.rect.y + (d.get(n.id)?.dy ?? 0));
    const gaps = [ys[1] - (ys[0] + 10), ys[2] - (ys[1] + 10)];
    expect(gaps[0]).toBeCloseTo(gaps[1]);
    expect(d.get(by('A').id)!.dy).toBe(0);
  });

  it('stacks end to end with a gap', () => {
    const d = stack(ab, 'y', 4);
    const ys = ab.map((n) => n.rect.y + (d.get(n.id)?.dy ?? 0));
    expect(ys[1] - (ys[0] + 10)).toBe(4);
    expect(ys[2] - (ys[1] + 10)).toBe(4);
  });

  it('moves anchored panels in the right direction and keeps their anchoring', () => {
    const io = { read: (p: string) => (p === 'resource/ui/row.res' ? arrangeFile : undefined) };
    const writes = planWrites(ab, s, moveBy(ab, 20, 0), io, opts);
    const out = applyWrites(ab, writes, 1, io, opts)['resource/ui/row.res'];
    const get = (n: string, k: string) => valueOf(out, ['Resource/UI/Row.res', n], k);
    expect(get('A', 'xpos')).toBe('20'); // scene is 480 high, so a pixel is a virtual unit
    expect(get('B', 'xpos')).toBe('r20'); // right-anchored: moving right shrinks the inset
    expect(get('C', 'xpos')).toBe('120');
  });

  it('does not move a pinned panel twice when its sibling moves too', () => {
    const io = { read: (p: string) => (p === 'resource/ui/row.res' ? arrangeFile : undefined) };
    const members = [by('C'), by('Kid')];
    const writes = planWrites(members, s, moveBy(members, 30, 0), io, opts);
    expect(writes.get(by('C').id)!.dx).toBe(30);
    expect(writes.get(by('Kid').id)!.dx).toBe(0);
  });

  it('writes a pinned panel only the difference when asked to go elsewhere', () => {
    const io = { read: (p: string) => (p === 'resource/ui/row.res' ? arrangeFile : undefined) };
    const members = [by('C'), by('Kid')];
    const desired = new Map([
      [by('C').id, { dx: 30, dy: 0 }],
      [by('Kid').id, { dx: 50, dy: 0 }],
    ]);
    const writes = planWrites(members, s, desired, io, opts);
    expect(writes.get(by('Kid').id)!.dx).toBe(20);
  });
});

describe('suggestions', () => {
  const near = arrangeFile
    .replace('"xpos" "r40" "ypos" "30"', '"xpos" "0" "ypos" "14"')
    .replace('"xpos" "100" "ypos" "60"', '"xpos" "0" "ypos" "28"');

  it('proposes near-identical panels as one group, and skips ones already in a block', () => {
    const s = scene(near);
    const io = { read: (p: string) => (p === 'resource/ui/row.res' ? near : undefined) };
    const sug = suggestSimilar(s, io, opts, []);
    expect(sug).toHaveLength(1);
    expect(sug[0].members).toHaveLength(3);
    expect(sug[0].shared).toMatchObject({ wide: '20', tall: '10' });
    const taken: Block = { id: 't', name: 't', members: sug[0].members, shared: {} };
    expect(suggestSimilar(s, io, opts, [taken])).toEqual([]);
  });

  it('does not group panels that are far apart', () => {
    const io = { read: (p: string) => (p === 'resource/ui/row.res' ? arrangeFile : undefined) };
    expect(suggestSimilar(scene(), io, opts, [])).toEqual([]);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evalCond, PC_ENV, X360_ENV } from '../scheme/cond';
import { parseScheme } from '../scheme/scheme';
import { layoutRect, parseDim } from '../layout/geometry';
import { propsOf } from '../kv/props';
import { parseKv } from '../kv/parse';
import { buildScene, hitTest, imagePath, type SceneContext } from '../scene/build';

const BASE = path.resolve(__dirname, '../../../public/tf2-hud/base');
const read = (p: string) => readFileSync(path.join(BASE, p), 'utf8');

const scheme = parseScheme(read('resource/clientscheme.res'), PC_ENV);
const ctx = (w: number, h: number, extra: Partial<SceneContext> = {}): SceneContext => ({
  readText: (p) => {
    try {
      return read(p);
    } catch {
      return undefined;
    }
  },
  scheme,
  env: PC_ENV,
  screen: { w, h },
  minmode: false,
  showHidden: false,
  forceShown: new Set(),
  forceHidden: new Set(),
  vars: new Map([['health', '125']]),
  strings: new Map(),
  progress: 0.5,
  ...extra,
});

describe('conditionals', () => {
  it('evaluates platform expressions', () => {
    expect(evalCond('$WIN32', PC_ENV)).toBe(true);
    expect(evalCond('$X360', PC_ENV)).toBe(false);
    expect(evalCond('!$X360', PC_ENV)).toBe(true);
    expect(evalCond('$WIN32 && !$X360', PC_ENV)).toBe(true);
    expect(evalCond('$X360 || $WIN32', X360_ENV)).toBe(true);
    expect(evalCond(undefined, PC_ENV)).toBe(true);
    expect(evalCond('garbage', PC_ENV)).toBe(true);
  });
});

describe('dimensions', () => {
  it('parses prefixes', () => {
    expect(parseDim('r120')).toEqual({ value: 120, align: 'end', fill: false });
    expect(parseDim('c-50')).toEqual({ value: -50, align: 'center', fill: false });
    expect(parseDim('f20')).toEqual({ value: 20, align: 'start', fill: true });
    expect(parseDim(undefined).value).toBe(0);
  });

  it('lays out relative to the parent at the virtual-480 scale', () => {
    const node = parseKv('"A" { "A" { xpos "r10" ypos "c-5" wide "f20" tall "40" } }').roots[0]
      .children![0];
    const r = layoutRect({
      props: propsOf(node, { env: PC_ENV }),
      parent: { x: 0, y: 0, w: 1920, h: 1080 },
      scale: 2.25,
    });
    expect(r).toEqual({ x: 1920 - 22, y: 540 - 11, w: 1920 - 45, h: 90 });
  });

  it('pins to a sibling corner', () => {
    const doc = parseKv(
      '"F" { "A" { xpos "0" ypos "0" wide "10" tall "10" } "B" { pin_to_sibling "A" pin_corner_to_sibling "0" pin_to_sibling_corner "1" xpos "2" ypos "0" wide "5" tall "5" } }',
    );
    const b = doc.roots[0].children![1];
    const r = layoutRect({
      props: propsOf(b, { env: PC_ENV }),
      parent: { x: 0, y: 0, w: 100, h: 100 },
      scale: 1,
      sibling: { x: 0, y: 0, w: 10, h: 10 },
    });
    expect(r).toEqual({ x: 12, y: 0, w: 5, h: 5 });
  });
});

describe('scheme', () => {
  it('resolves named and literal colours', async () => {
    const { resolveColor } = await import('../scheme/scheme');
    expect(resolveColor(scheme, 'White')).toEqual({ r: 235, g: 235, b: 235, a: 255 });
    expect(resolveColor(scheme, '10 20 30')).toEqual({ r: 10, g: 20, b: 30, a: 255 });
    expect(resolveColor(scheme, 'NoSuchColour')).toBeUndefined();
  });

  it('picks proportional vs windowed fonts by resolution', async () => {
    const { pickFont } = await import('../scheme/scheme');
    expect(pickFont(scheme, 'Default', 700)?.px).toBe(13);
    expect(pickFont(scheme, 'Default', 1080)?.px).toBe(20);
    expect(pickFont(scheme, 'HudClassHealth', 480)?.def.name).toBeTruthy();
  });
});

describe('scene', () => {
  it('positions the health HUD like the game at 1080p', () => {
    const scene = buildScene(ctx(1920, 1080), ['resource/ui/hudplayerhealth.res']);
    const frame = scene.nodes.find((n) => n.isFrame)!;
    expect(frame.rect).toEqual({ x: 0, y: 1080 - 270, w: 562, h: 270 });
    const img = scene.nodes.find((n) => n.name === 'PlayerStatusHealthImageBG')!;
    expect(img.rect.x).toBe(164); // trunc(73 * 2.25)
    expect(img.rect.y).toBe(frame.rect.y + 74); // trunc(33 * 2.25)
    expect(scene.images).toContain('materials/hud/health_bg');
    const value = scene.nodes.find((n) => n.name === 'PlayerStatusHealthValue')!;
    const text = value.ops.find((o) => o.t === 'text');
    expect(text && text.t === 'text' ? text.text : '').toBe('125');
  });

  it('keeps hidden panels hidden unless revealed', () => {
    const hidden = (c: SceneContext) =>
      buildScene(c, ['resource/ui/hudplayerhealth.res']).nodes.find(
        (n) => n.name === 'PlayerStatusHealthBonusImage',
      )!;
    expect(hidden(ctx(1280, 720)).shown).toBe(false);
    expect(hidden(ctx(1280, 720, { showHidden: true })).shown).toBe(true);
  });

  it('uses _minmode values when asked', () => {
    const y = (minmode: boolean) =>
      buildScene(ctx(640, 480, { minmode }), ['resource/ui/hudplayerhealth.res']).nodes.find(
        (n) => n.isFrame,
      )!.rect.y;
    expect(y(false)).toBe(480 - 120);
    expect(y(true)).toBe(480 - 88);
  });

  it('hit-tests the topmost shown panel', () => {
    const scene = buildScene(ctx(640, 480), ['resource/ui/hudplayerhealth.res']);
    const hit = hitTest(scene, 80, 480 - 120 + 40);
    expect(hit).toBeDefined();
    expect(hitTest(scene, 630, 5)).toBeUndefined();
  });

  it('builds every base panel file at several resolutions without throwing', () => {
    const files = [
      'resource/ui/hudammoweapons.res',
      'resource/ui/hudmatchstatus.res',
      'resource/ui/classselection.res',
      'resource/ui/hudaccountpanel.res',
      'resource/ui/hudobjectivestatus.res',
    ];
    for (const [w, h] of [
      [640, 480],
      [1280, 720],
      [2560, 1440],
    ] as const) {
      const scene = buildScene(ctx(w, h, { showHidden: true }), files);
      expect(scene.nodes.length).toBeGreaterThan(0);
      for (const n of scene.nodes) {
        expect(Number.isFinite(n.rect.x + n.rect.y + n.rect.w + n.rect.h)).toBe(true);
      }
    }
  });

  it('roots image paths at materials/vgui', () => {
    expect(imagePath('../hud/health_bg')).toBe('materials/hud/health_bg');
    expect(imagePath('hud/foo.vtf')).toBe('materials/vgui/hud/foo');
    expect(imagePath('../../../../etc/passwd')).toBe('etc/passwd');
  });
});

describe('validation', () => {
  it('finds nothing alarming in the base HUD and flags real mistakes', async () => {
    const { validateFiles, countBySeverity } = await import('../validate');
    const manifest = JSON.parse(read('manifest.json'));
    const have = new Set<string>(manifest.files.map((f: [string]) => f[0]));
    const run = (scope: string[], over: Record<string, string> = {}) =>
      validateFiles({
        scope,
        readText: (p) => over[p] ?? ctx(1, 1).readText(p),
        size: () => undefined,
        exists: (p) => have.has(p) || p in over,
        scheme,
      });

    const baseIssues = run(['resource/ui/hudplayerhealth.res', 'resource/ui/hudammoweapons.res']);
    expect(countBySeverity(baseIssues).error).toBe(0);

    const broken = run(['resource/ui/x.res'], {
      'resource/ui/x.res':
        '#base "nope.res"\n"A" { "B" { font "NoSuchFont" fgcolor "NoSuchColor" border "NoBorder9" } ',
    });
    const codes = broken.map((i) => i.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'missing-base',
        'unknown-font',
        'unknown-color',
        'unknown-border',
        'syntax',
      ]),
    );
  });
});

describe('drag deltas', () => {
  it('keeps anchoring prefixes while shifting', async () => {
    const { shiftPosition, growSize } = await import('../layout/inverse');
    expect(shiftPosition('10', 5)).toBe('15');
    expect(shiftPosition('r120', 5)).toBe('r115');
    expect(shiftPosition('c-50', 5)).toBe('c-45');
    expect(shiftPosition(undefined, 3)).toBe('3');
    expect(growSize('50', 10)).toBe('60');
    expect(growSize('f20', 10)).toBe('f10');
    expect(growSize('4', -10)).toBe('0');
  });
});

describe('env-aware edits', () => {
  it('edits the platform-live copy of a repeated key', async () => {
    const { kvSet } = await import('../kv/edit');
    const src = '"F" { "P" { "xpos" "0" [$WIN32]\n"xpos" "32" [$X360] } }';
    const out = kvSet(src, ['F', 'P', 'xpos'], '9', { env: PC_ENV });
    expect(out).toBe('"F" { "P" { "xpos" "9" [$WIN32]\n"xpos" "32" [$X360] } }');
    expect(kvSet(src, ['F', 'P', 'xpos'], '9', { env: X360_ENV })).toContain('"9" [$X360]');
  });
});

describe('font registration', () => {
  it('adds a numbered CustomFontFiles entry and a named font', async () => {
    const { registerFontInScheme } = await import('../scheme/register-font');
    const out = registerFontInScheme(read('resource/clientscheme.res'), {
      file: 'resource/myfont.ttf',
      schemeName: 'MyHudFont',
      face: 'My Font',
      tall: 18,
      weight: 700,
    });
    const reparsed = parseScheme(out, PC_ENV);
    expect(reparsed.customFontFiles.some((f) => f.file === 'resource/myfont.ttf')).toBe(true);
    expect(reparsed.fonts.get('myhudfont')?.[0]).toMatchObject({
      name: 'My Font',
      tall: 18,
      weight: 700,
    });
    // Registering twice does not duplicate the file entry.
    const twice = registerFontInScheme(out, {
      file: 'resource/myfont.ttf',
      schemeName: 'MyHudFont',
      face: 'My Font',
      tall: 18,
      weight: 700,
    });
    expect(
      parseScheme(twice, PC_ENV).customFontFiles.filter((f) => f.file === 'resource/myfont.ttf'),
    ).toHaveLength(1);
  });
});

describe('hudlayout.res', () => {
  it('positions elements from their layout block and routes edits there', () => {
    const scene = buildScene(ctx(1920, 1080), ['resource/ui/hudammoweapons.res']);
    const frame = scene.nodes.find((n) => n.isFrame)!;
    // "xpos" "r95" / "ypos" "r55" / wide 94 / tall 45 at 2.25x.
    expect(frame.rect).toEqual({ x: 1920 - 213, y: 1080 - 123, w: 211, h: 101 });
    expect(frame.file).toBe('scripts/hudlayout.res');
    expect(frame.keyPath).toEqual(['Resource/HudLayout.res', 'HudWeaponAmmo']);
    expect(
      scene.nodes
        .filter((n) => !n.isFrame)
        .every((n) => n.file === 'resource/ui/hudammoweapons.res'),
    ).toBe(true);
  });

  it('keeps hud elements inside the 4:3 virtual screen at 640x480', () => {
    const scene = buildScene(ctx(640, 480), [
      'resource/ui/hudammoweapons.res',
      'resource/ui/hudmediccharge.res',
    ]);
    for (const n of scene.nodes.filter((x) => x.isFrame)) {
      expect(n.rect.x).toBeGreaterThanOrEqual(0);
      expect(n.rect.y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('textures', () => {
  it('does not mistake colour values for texture paths', () => {
    const files = new Map([
      [
        'resource/ui/x.res',
        '"Resource/UI/X.res" { "X" { "ControlName" "ImagePanel" "wide" "10" "tall" "10" "image" "235 140 140 255" } }',
      ],
    ]);
    const scene = buildScene({ ...ctx(640, 480), readText: (p) => files.get(p) }, [
      'resource/ui/x.res',
    ]);
    expect(scene.images).toEqual([]);
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyMaterial } from '../assets/images';
import { decodeVtf } from '../assets/vtf';
import { materialInfo, parseColorParam, parseVmt } from '../assets/vmt';
import { gateFor, progressFor } from '../game-state';
import { DEFAULT_TEST_STATE } from '../fixtures';
import { PC_ENV } from '../scheme/cond';
import { parseScheme } from '../scheme/scheme';
import { buildScene, type SceneContext } from '../scene/build';

const BASE = path.resolve(__dirname, '../../../public/tf2-hud/base');
const MATERIALS = path.join(BASE, 'materials');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? walk(f) : [f];
  });

describe('VMT parsing', () => {
  it('reads the parameters that decide how a texture is drawn', () => {
    const doc = parseVmt(
      `"UnlitGeneric" { "$baseTexture" "hud\\\\health_bg" "$translucent" 1 "$additive" "1" "$color" "[1 0.5 0]" "$alpha" "0.5" }`,
    )!;
    const info = materialInfo(doc);
    expect(info.shader).toBe('unlitgeneric');
    expect(info.baseTexture).toBe('hud/health_bg');
    expect(info.usesAlpha).toBe(true);
    expect(info.additive).toBe(true);
    expect(info.color).toEqual([255, 128, 0]);
    expect(info.alpha).toBe(0.5);
  });

  it('merges patch materials onto their include', () => {
    const doc = parseVmt(
      `"patch" { "include" "materials/vgui/foo.vmt" "insert" { "$color" "{10 20 30}" } }`,
    )!;
    expect(doc.shader).toBe('patch');
    expect(doc.include).toBe('vgui/foo');
    expect(parseColorParam(doc.params.get('$color'))).toEqual([10, 20, 30]);
  });

  it('bakes colour and the opaque/alpha-test rules into pixels', () => {
    const px = () => new Uint8ClampedArray([200, 100, 50, 80, 10, 10, 10, 255]);
    const opaque = px();
    applyMaterial(opaque, materialInfo(parseVmt('"UnlitGeneric" { "$basetexture" "a" }')!));
    expect([opaque[3], opaque[7]]).toEqual([255, 255]); // no $translucent: alpha ignored

    const translucent = px();
    applyMaterial(
      translucent,
      materialInfo(parseVmt('"UnlitGeneric" { "$translucent" 1 "$color" "[0.5 0.5 0.5]" }')!),
    );
    expect([translucent[0], translucent[3]]).toEqual([100, 80]);

    const tested = px();
    applyMaterial(tested, materialInfo(parseVmt('"UnlitGeneric" { "$alphatest" 1 }')!));
    expect([tested[3], tested[7]]).toEqual([0, 255]); // 80 < 0.7*255
  });
});

describe('VTF decoding of the supplied materials', () => {
  const vtfs = walk(MATERIALS).filter((f) => f.endsWith('.vtf'));

  it('decodes every texture in the base pack', () => {
    expect(vtfs.length).toBeGreaterThan(400);
    const bad = vtfs.filter((f) => !decodeVtf(new Uint8Array(readFileSync(f))));
    expect(bad.map((f) => path.relative(MATERIALS, f))).toEqual([]);
  });

  it('reads the real size and pixels, not a mip or the wrong frame', () => {
    const img = decodeVtf(new Uint8Array(readFileSync(path.join(MATERIALS, 'hud/team_red.vtf'))))!;
    expect([img.width, img.height]).toEqual([1024, 1024]);
    // A logo on a transparent field: corners clear, centre painted.
    expect(img.data[3]).toBe(0);
    const mid = ((512 * 1024 + 512) * 4) | 0;
    expect(img.data[mid + 3]).toBeGreaterThan(0);
  });
});

describe('panel tree and z-order', () => {
  const files: Record<string, string> = {
    'resource/ui/a.res': `"Resource/UI/A.res" {
      "Frame" { "ControlName" "EditablePanel" "wide" "100" "tall" "100" "xpos" "10" "ypos" "10" "zpos" "0" "visible" "1" }
      "Parent" { "ControlName" "EditablePanel" "xpos" "20" "ypos" "20" "wide" "50" "tall" "50" "zpos" "1" "visible" "1"
        "Child" { "ControlName" "Label" "xpos" "5" "ypos" "5" "wide" "100" "tall" "10" "zpos" "0" "labeltext" "hi" "visible" "1" }
        "Hidden" { "ControlName" "Label" "visible" "0" "wide" "10" "tall" "10" "labeltext" "x" }
      }
      "Over" { "ControlName" "Label" "xpos" "0" "ypos" "0" "wide" "10" "tall" "10" "zpos" "5" "labeltext" "o" "visible" "1" }
      "Under" { "ControlName" "Label" "xpos" "0" "ypos" "0" "wide" "10" "tall" "10" "zpos" "-2" "labeltext" "u" "visible" "1" }
    }`,
  };
  const ctx = (): SceneContext => ({
    readText: (p) => files[p],
    scheme: parseScheme('"Scheme" { "Colors" {} "Fonts" {} }', PC_ENV),
    env: PC_ENV,
    screen: { w: 640, h: 480 },
    minmode: false,
    showHidden: false,
    forceShown: new Set(),
    forceHidden: new Set(),
    vars: new Map(),
    strings: new Map(),
    progress: 0.5,
  });

  it('paints parents before children, siblings by zpos, and nests coordinates', () => {
    const scene = buildScene(ctx(), ['resource/ui/a.res']);
    const names = scene.nodes.map((n) => n.name);
    expect(names.indexOf('Parent')).toBeLessThan(names.indexOf('Child'));
    expect(names.indexOf('Under')).toBeLessThan(names.indexOf('Parent'));
    expect(names.indexOf('Parent')).toBeLessThan(names.indexOf('Over'));
    const parent = scene.nodes.find((n) => n.name === 'Parent')!;
    const child = scene.nodes.find((n) => n.name === 'Child')!;
    expect(child.rect.x).toBe(parent.rect.x + 5);
    expect(child.parentId).toBe(parent.id);
    expect(child.clip).toEqual(parent.rect); // children are clipped to their parent
    expect(scene.nodes.find((n) => n.name === 'Hidden')!.shown).toBe(false);
  });
});

describe('weapon HUD state', () => {
  it('shows the right Medic meters for the weapon', () => {
    const medigun = gateFor({ ...DEFAULT_TEST_STATE, playerClass: 'medic', weapon: 'medigun' });
    const vacc = gateFor({ ...DEFAULT_TEST_STATE, playerClass: 'medic', weapon: 'vaccinator' });
    const file = 'resource/ui/hudmediccharge.res';
    expect(medigun(file, 'ChargeMeter')).toBe(true);
    expect(medigun(file, 'ChargeMeter2')).toBe(false);
    expect(vacc(file, 'ChargeMeter')).toBe(false);
    expect(vacc(file, 'ChargeMeter2')).toBe(true);
    const scout = gateFor({ ...DEFAULT_TEST_STATE, playerClass: 'scout' });
    expect(scout(file, 'HudMedicCharge')).toBe(false);
  });

  it('splits the Vaccinator charge across its four bars', () => {
    const p = progressFor({
      ...DEFAULT_TEST_STATE,
      playerClass: 'medic',
      weapon: 'vaccinator',
      charge: 62,
    });
    const f = 'resource/ui/hudmediccharge.res';
    expect([1, 2, 3, 4].map((n) => Math.round(p(f, `ChargeMeter${n}`)! * 100) / 100)).toEqual([
      1, 1, 0.48, 0,
    ]);
  });

  it('keeps transient events off until asked for', () => {
    const off = gateFor({ ...DEFAULT_TEST_STATE });
    const on = gateFor({ ...DEFAULT_TEST_STATE, events: ['killstreak'] });
    expect(off('resource/ui/hudkillstreaknotice.res', 'Background')).toBe(false);
    expect(on('resource/ui/hudkillstreaknotice.res', 'Background')).toBe(true);
  });
});

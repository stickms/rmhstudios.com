import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contrast,
  hsvToRgb,
  over,
  parseColorInput,
  rgbToHsv,
  toHex,
  toVguiLiteral,
} from '../color';
import { PC_ENV } from '../scheme/cond';
import {
  addSchemeFont,
  fontFaceCount,
  removeSchemeColor,
  setFontFaceProp,
  setSchemeColor,
} from '../scheme/edit';
import { describeFont, explainDim, listSchemeColors, resolveColorChain } from '../scheme/inspect';
import { parseScheme } from '../scheme/scheme';

const text = readFileSync(
  path.resolve(__dirname, '../../../public/tf2-hud/base/resource/clientscheme.res'),
  'utf8',
);
const scheme = parseScheme(text, PC_ENV);

describe('colour maths', () => {
  it('round-trips RGB through HSV', () => {
    for (const c of [
      { r: 235, g: 227, b: 203, a: 255 },
      { r: 0, g: 0, b: 0, a: 255 },
      { r: 255, g: 0, b: 128, a: 255 },
      { r: 12, g: 200, b: 99, a: 255 },
    ]) {
      const back = hsvToRgb(rgbToHsv(c), c.a);
      expect(
        Math.abs(back.r - c.r) + Math.abs(back.g - c.g) + Math.abs(back.b - c.b),
      ).toBeLessThanOrEqual(2);
    }
  });

  it('parses hex, rgb() and VGUI literals; rejects junk', () => {
    expect(parseColorInput('#fa0')).toEqual({ r: 255, g: 170, b: 0, a: 255 });
    expect(parseColorInput('#11223344')).toEqual({ r: 17, g: 34, b: 51, a: 68 });
    expect(parseColorInput('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 128 });
    expect(parseColorInput('10 20 30')).toEqual({ r: 10, g: 20, b: 30, a: 255 });
    expect(parseColorInput('300 0 0 999')).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(parseColorInput('notacolour')).toBeUndefined();
    expect(toVguiLiteral({ r: 1, g: 2, b: 3, a: 4 })).toBe('1 2 3 4');
    expect(toHex({ r: 255, g: 0, b: 16, a: 128 }, true)).toBe('#ff001080');
  });

  it('computes contrast and alpha compositing', () => {
    expect(contrast({ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 })).toBeCloseTo(
      21,
      0,
    );
    expect(over({ r: 255, g: 0, b: 0, a: 128 }, { r: 0, g: 0, b: 0, a: 255 }).r).toBe(128);
  });
});

describe('value resolution', () => {
  it('follows scheme colour names to a final colour', () => {
    const direct = resolveColorChain(scheme, 'White');
    expect(direct.kind).toBe('scheme');
    expect(direct.rgba).toEqual({ r: 235, g: 235, b: 235, a: 255 });
    expect(resolveColorChain(scheme, '1 2 3').kind).toBe('literal');
    expect(resolveColorChain(scheme, 'NoSuchColour').kind).toBe('unknown');
    const base = [...scheme.base].find(([, v]) => scheme.colors.has(v.toLowerCase()));
    if (base) expect(resolveColorChain(scheme, base[0]).chain.length).toBeGreaterThan(1);
    expect(listSchemeColors(scheme).length).toBeGreaterThan(50);
  });

  it('describes which face is active at a resolution', () => {
    const d = describeFont(scheme, 'Default', 700)!;
    expect(d.faces.filter((f) => f.active)).toHaveLength(1);
    expect(d.faces.find((f) => f.active)?.def.tall).toBe(13);
    expect(describeFont(scheme, 'NoSuchFont', 720)).toBeUndefined();
  });

  it('explains positions in words at the current scale', () => {
    expect(explainDim('ypos', 'r120', 2.25, 1080).text).toBe(
      '120 units from the bottom edge → 810 px from the top',
    );
    expect(explainDim('xpos', 'c-50', 2.25, 1920).px).toBe(960 - 112);
    expect(explainDim('wide', 'f20', 2.25, 1920).text).toContain('parent width');
    expect(explainDim('xpos', '4', 1, 640, { sibling: 'Icon' }).px).toBeNull();
  });
});

describe('scheme edits', () => {
  it('changes one colour and nothing else', () => {
    const out = setSchemeColor(text, 'White', '1 2 3 255');
    expect(parseScheme(out, PC_ENV).colors.get('white')).toBe('1 2 3 255');
    expect(out.length).toBeLessThanOrEqual(text.length);
    const added = setSchemeColor(text, 'BrandNew', '9 9 9 255');
    expect(parseScheme(added, PC_ENV).colors.get('brandnew')).toBe('9 9 9 255');
    expect(parseScheme(removeSchemeColor(added, 'BrandNew'), PC_ENV).colors.has('brandnew')).toBe(
      false,
    );
  });

  it('edits and creates font faces', () => {
    const faces = fontFaceCount(text, 'Default');
    expect(faces).toBeGreaterThan(1);
    const out = setFontFaceProp(text, 'Default', 1, 'tall', '99');
    expect(parseScheme(out, PC_ENV).fonts.get('default')![0].tall).toBe(99);
    const made = addSchemeFont(text, 'MyFont', { name: 'Arial', tall: 20, weight: 700 });
    expect(parseScheme(made, PC_ENV).fonts.get('myfont')![0]).toMatchObject({
      name: 'Arial',
      tall: 20,
      weight: 700,
      antialias: true,
    });
  });
});

describe('label substitution', () => {
  it('resolves %vars% and #tokens, giving unknown ones a readable placeholder', async () => {
    const { substituteLabel } = await import('../scene/build');
    const vars = new Map([['health', '125']]);
    const strings = new Map([['tf_hud_ok', 'Okay']]);
    expect(substituteLabel('%Health%', vars, strings)).toBe('125');
    expect(substituteLabel('HP: %health% / %Mystery_Value%', vars, strings)).toBe(
      'HP: 125 / Mystery Value',
    );
    expect(substituteLabel('#TF_Hud_Ok', vars, strings)).toBe('Okay');
    expect(substituteLabel('#Missing_Token', vars, strings)).toBe('Missing Token');
    expect(substituteLabel('#TF_IndividualUberCharges', vars, strings)).toBe(
      'Individual Uber Charges',
    );
  });
});

describe('fonts', () => {
  it('knows the bundled TF2 faces, custom and system fonts', async () => {
    const { BUNDLED_FACES, fontFamilyFor, fontGroups, fontStatus, knownFontNames } =
      await import('../assets/fonts');
    expect(Object.keys(BUNDLED_FACES)).toEqual([
      'tf2',
      'tf2 build',
      'tf2 secondary',
      'tf2 professor',
      'tfd',
      'team fortress logo',
    ]);
    expect(fontFamilyFor('TF2 Build')).toMatch(/^"TF2 Build",/);
    expect(fontFamilyFor('verdana')).toContain('Verdana');
    expect(fontFamilyFor('Some Custom Face')).toMatch(/^"Some Custom Face",/);
    const always = () => true;
    expect(fontStatus('TF2 Secondary', always)).toBe('bundled');
    expect(fontStatus('Verdana', always)).toBe('system');
    expect(fontStatus('Nope', () => false)).toBe('missing');
    expect(fontGroups().bundled).toHaveLength(6);
    expect(knownFontNames()[0]).toBe('TF2');
  });
});

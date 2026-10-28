import { describe, expect, it } from 'vitest';
import {
  colorSlots,
  colorUsage,
  describeColor,
  isColorProp,
  suggestedColorKey,
  wouldCycle,
} from '../color-vars';
import { propsFromMap } from '../kv/props';
import { PC_ENV } from '../scheme/cond';
import { setSchemeBase, setSchemeColor, setSchemeHop } from '../scheme/edit';
import { resolveColorChain } from '../scheme/inspect';
import { parseScheme } from '../scheme/scheme';

const SCHEME = `"Scheme"
{
	"Colors"
	{
		"Tan"		"235 227 203 255"
		"TanDark"	"Tan"
		"Loop1"		"Loop2"
		"Loop2"		"Loop1"
		"Red"		"200 0 0 255"
	}
	"BaseSettings"
	{
		"FgColor"	"TanDark"
		"BgColor"	"0 0 0 100"
	}
	"Borders"
	{
		"Edge"
		{
			"Left"
			{
				"1"
				{
					"color"	"Tan"
					"offset" "0 0"
				}
			}
		}
	}
}
`;
const scheme = parseScheme(SCHEME, PC_ENV);

describe('colour properties', () => {
  it('recognises colour keys, not their size or minmode variants', () => {
    for (const k of [
      'fgcolor',
      'bgcolor_override',
      'drawcolor',
      'armedfgcolor_override',
      'FgColor_Override',
    ]) {
      expect(isColorProp(k), k).toBe(true);
    }
    for (const k of ['xpos', 'font', 'border', 'fgcolor_minmode', 'labelText'])
      expect(isColorProp(k), k).toBe(false);
  });

  it('lists a panel’s colours, most useful first, with what each is tied to', () => {
    const props = propsFromMap({
      xpos: '1',
      drawcolor: 'Red',
      bgcolor_override: '0 0 0 0',
      fgcolor: 'TanDark',
    });
    const slots = colorSlots(props, scheme);
    expect(slots.map((s) => s.key)).toEqual(['fgcolor', 'bgcolor_override', 'drawcolor']);
    expect(slots[0]).toMatchObject({ kind: 'variable', rgba: { r: 235, g: 227, b: 203, a: 255 } });
    expect(slots[0].hops.map((h) => h.name)).toEqual(['TanDark', 'Tan']);
    expect(slots[1]).toMatchObject({ kind: 'literal', hops: [] });
  });

  it('knows base-setting names, literals and nonsense', () => {
    expect(describeColor(scheme, 'fgcolor', 'FgColor').hops).toEqual([
      { name: 'FgColor', source: 'base' },
      { name: 'TanDark', source: 'colors' },
      { name: 'Tan', source: 'colors' },
    ]);
    expect(describeColor(scheme, 'fgcolor', 'NoSuchColour').kind).toBe('unknown');
    expect(describeColor(scheme, 'fgcolor', '').kind).toBe('unknown');
    expect(describeColor(scheme, 'fgcolor', '1 2 3').kind).toBe('literal');
  });

  it('suggests the property to add by what the control is', () => {
    expect(suggestedColorKey('label')).toBe('fgcolor');
    expect(suggestedColorKey('image')).toBe('drawcolor');
    expect(suggestedColorKey('panel')).toBe('bgcolor_override');
  });
});

describe('changing a name safely', () => {
  it('refuses a name that would loop back on itself', () => {
    expect(wouldCycle(scheme, 'Tan', 'TanDark')).toBe(true); // TanDark → Tan → … would make Tan → TanDark → Tan
    expect(wouldCycle(scheme, 'Tan', 'Tan')).toBe(true);
    expect(wouldCycle(scheme, 'Tan', 'Red')).toBe(false);
    expect(wouldCycle(scheme, 'Tan', '1 2 3 255')).toBe(false);
    expect(wouldCycle(scheme, 'TanDark', 'tan')).toBe(false);
  });

  it('counts who else would change', () => {
    const files = [
      {
        path: 'resource/ui/a.res',
        text: '"R" { "A" { "fgcolor" "Tan" "bgcolor_override" "tan" "xpos" "Tan" } }',
      },
      { path: 'resource/ui/b.res', text: '"R" { "B" { "drawcolor" "Red" } }' },
      { path: 'resource/ui/c.res', text: '"R" { "C" { "fgcolor_override" "Tan" } }' },
    ];
    // TanDark and the border layer name Tan; the Colors entry for Tan itself does not count.
    expect(colorUsage('Tan', SCHEME, files)).toEqual({ scheme: 2, panels: 3, files: 2 });
    expect(colorUsage('Red', SCHEME, files)).toEqual({ scheme: 0, panels: 1, files: 1 });
    expect(colorUsage('Nothing', undefined, [])).toEqual({ scheme: 0, panels: 0, files: 0 });
  });
});

describe('scheme edits for a hop', () => {
  it('changes a colour in place, keeping the rest of the file', () => {
    const out = setSchemeHop(SCHEME, { name: 'Tan', source: 'colors' }, '1 2 3 255');
    expect(out).toContain('"Tan"\t\t"1 2 3 255"');
    expect(out).toContain('"TanDark"\t"Tan"');
    expect(parseScheme(out, PC_ENV).colors.get('tan')).toBe('1 2 3 255');
    // Everything that names Tan now resolves to the new colour.
    expect(resolveColorChain(parseScheme(out, PC_ENV), 'TanDark').rgba).toEqual({
      r: 1,
      g: 2,
      b: 3,
      a: 255,
    });
  });

  it('can detach a name from what it pointed at', () => {
    const out = setSchemeColor(SCHEME, 'TanDark', '10 10 10 255');
    const s = parseScheme(out, PC_ENV);
    expect(resolveColorChain(s, 'TanDark').rgba?.r).toBe(10);
    expect(resolveColorChain(s, 'Tan').rgba?.r).toBe(235);
  });

  it('edits built-in base settings too', () => {
    const out = setSchemeHop(SCHEME, { name: 'BgColor', source: 'base' }, '5 5 5 5');
    expect(parseScheme(out, PC_ENV).base.get('bgcolor')).toBe('5 5 5 5');
    expect(setSchemeBase('"Nope" { }', 'X', '1')).toBe('"Nope" { }');
  });
});

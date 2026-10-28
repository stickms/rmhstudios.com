import { beforeEach, describe, expect, it } from 'vitest';
import { createBlock, readBlocksDoc } from '../blocks/actions';
import { propsOf } from '../kv/props';
import { kvAt } from '../kv/query';
import { writePanelProp } from '../panel-edit';
import { useTf2HudPrefs } from '../prefs';
import { parseCached } from '../scene/build';
import { PC_ENV } from '../scheme/cond';
import { useEditor } from '../store';

const FILE = 'resource/ui/a.res';
const TEXT = `"Resource/UI/A.res"
{
	"One"
	{
		"ControlName"	"CExLabel"
		"fgcolor"	"Tan"
		"wide"	"10"
		"wide_minmode"	"5"
	}
	"Two"
	{
		"ControlName"	"CExLabel"
		"fgcolor"	"Tan"
		"wide"	"10"
	}
}
`;
const node = (name: string) => ({
  id: `${FILE}#${name}`,
  file: FILE,
  keyPath: ['Resource/UI/A.res', name],
});
const valueOf = (name: string, key: string, minmode = false) => {
  const text = useEditor.getState().readText(FILE)!;
  return propsOf(kvAt(parseCached(text), ['Resource/UI/A.res', name])!, {
    env: PC_ENV,
    minmode,
  }).get(key);
};

beforeEach(() => {
  useEditor.getState().newProject();
  useEditor.getState().writeText(FILE, TEXT);
  useEditor.getState().setView({ minmode: false });
  useTf2HudPrefs.getState().set('blockScope', 'block');
});

describe('writePanelProp', () => {
  it('writes the value into the panel’s own file', () => {
    writePanelProp(node('One'), 'fgcolor', 'Red');
    expect(valueOf('One', 'fgcolor')).toBe('Red');
    expect(valueOf('Two', 'fgcolor')).toBe('Tan');
  });

  it('edits the _minmode copy while previewing minmode and one exists', () => {
    useEditor.getState().setView({ minmode: true });
    writePanelProp(node('One'), 'wide', '99');
    expect(valueOf('One', 'wide_minmode')).toBe('99');
    expect(valueOf('One', 'wide')).toBe('10');
    // A panel with no minmode copy gets the plain key.
    writePanelProp(node('Two'), 'wide', '77');
    expect(valueOf('Two', 'wide')).toBe('77');
  });

  it('sends the edit to the whole block, or only this panel when the author chooses', () => {
    const made = createBlock('Labels', [
      { file: FILE, path: ['Resource/UI/A.res', 'One'], pinned: [] },
      { file: FILE, path: ['Resource/UI/A.res', 'Two'], pinned: [] },
    ]);
    expect(made.block).toBeDefined();
    writePanelProp(node('One'), 'fgcolor', 'Red');
    expect(valueOf('One', 'fgcolor')).toBe('Red');
    expect(valueOf('Two', 'fgcolor')).toBe('Red');

    useTf2HudPrefs.getState().set('blockScope', 'panel');
    writePanelProp(node('Two'), 'fgcolor', 'Blue');
    expect(valueOf('Two', 'fgcolor')).toBe('Blue');
    expect(valueOf('One', 'fgcolor')).toBe('Red');
    expect(readBlocksDoc().blocks[0].members[1].pinned).toContain('fgcolor');

    // A key already overridden is just that panel's, whatever the scope.
    useTf2HudPrefs.getState().set('blockScope', 'block');
    writePanelProp(node('Two'), 'fgcolor', 'Green');
    expect(valueOf('Two', 'fgcolor')).toBe('Green');
    expect(valueOf('One', 'fgcolor')).toBe('Red');
  });

  it('does nothing for a file that is not loaded', () => {
    expect(() =>
      writePanelProp(
        { id: 'x', file: 'resource/ui/none.res', keyPath: ['a', 'b'] },
        'fgcolor',
        'Red',
      ),
    ).not.toThrow();
  });
});

/** Floating surfaces must retarget on interruption and finish before unmount. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';
import { POP_COLLAPSE_MS } from '@/lib/motion';
import { readCss } from './css-source';
const CSS =
  readCss(
    join(
      __dirname,
      '../../app/globals.css',
    ),
  );
const DIALOG =
  readFileSync(
    join(
      __dirname,
      '../../components/ui/dialog.css',
    ),
    'utf8',
  );

describe('reversible floating surfaces', () => {
  it('changes opacity alone (Steel M5: no scale, no slide) and never replaces positioning transforms', () => {
    const start =
      CSS.indexOf(
        '/* Transitions retarget',
      );
    const end =
      CSS.indexOf(
        '@keyframes motion-presence',
        start,
      );
    const rules =
      CSS.slice(
        start,
        end,
      );
    expect(
      rules,
    ).toContain(
      'transition:',
    );
    expect(
      rules,
    ).toContain(
      '@starting-style',
    );
    expect(
      rules.replace(
        /\/\*[\s\S]*?\*\//g,
        '',
      ),
    ).not.toMatch(
      /scale:|transform:|rotate:|clip-path:/,
    );
  });
  it('lets Radix Presence wait for the transition without animating a second property', () => {
    expect(
      CSS,
    ).toMatch(
      /animation: motion-presence var\(--motion-collapse\)/,
    );
    expect(
      CSS,
    ).toMatch(
      /@keyframes motion-presence\s*\{\s*from\s*\{\s*visibility: visible/,
    );
    expect(
      DIALOG,
    ).toContain(
      'animation: ui-dialog-presence var(--motion-out)',
    );
  });
  it('keeps the React exit lifetime equal to the CSS close duration', () => {
    const collapse =
      /--motion-collapse:\s*([\d.]+)s/.exec(
        CSS,
      );
    expect(
      collapse,
    ).not.toBeNull();
    expect(
      Math.round(
        Number(
          collapse![1],
        ) *
          1000,
      ),
    ).toBe(
      POP_COLLAPSE_MS,
    );
    expect(
      POP_COLLAPSE_MS,
    ).toBe(
      160,
    );
  });
  it('dialogs open and close by opacity alone, with the scrim fading alongside (M5)', () => {
    expect(
      DIALOG,
    ).toContain(
      '@starting-style',
    );
    expect(
      DIALOG,
    ).not.toMatch(
      /scale:|transform:|translateY|rotate/,
    );
  });
});

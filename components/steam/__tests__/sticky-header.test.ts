import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The Steam top and bottom bars stay pinned, and everything that depends on their heights accounts for them. */
const css = readFileSync(join(__dirname, '..', 'steam.css'), 'utf8');
const rule = (sel: string) => new RegExp(`(?:^|\\n)${sel.replace(/[.[\]]/g, '\\$&')} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';

describe('sticky Steam header', () => {
  it('pins the top bar above the page', () => {
    const r = rule('.stm-topbar');
    expect(r).toMatch(/position:\s*sticky/);
    expect(r).toMatch(/top:\s*0/);
    expect(r).toMatch(/z-index:\s*\d+/);
  });

  it('puts the library sidebar below the header, not under it', () => {
    const r = rule('.stm-side');
    expect(r).toMatch(/top:\s*var\(--stm-header-h\)/);
    // ...and above the pinned bottom bar, so its last rows are never hidden behind it.
    expect(r).toMatch(/height:\s*calc\(100dvh - var\(--stm-header-h\) - var\(--stm-bottom-h\)\)/);
  });

  it('pins the bottom bar so it is always in view, except on iOS WebKit', () => {
    const r = rule('.stm-bottombar');
    expect(r).toMatch(/position:\s*sticky/);
    expect(r).toMatch(/bottom:\s*0/);
    expect(r).toMatch(/z-index:\s*\d+/);
    // iOS 26 Safari fills the strip behind its tab bar from a bottom-edge layer: there the bar stays in the flow
    // and the sidebar has no bar to clear.
    expect(rule('html.ios-webkit .stm-bottombar')).toMatch(/position:\s*static/);
    expect(rule('html.ios-webkit .steam')).toMatch(/--stm-bottom-h:\s*0px/);
  });

  it('keeps in-page anchors from landing under the header', () => {
    expect(css).toMatch(/\.steam \[id\]\s*\{[^}]*scroll-margin-top:[^}]*--stm-header-h/);
    expect(css).toMatch(/\.steam \[id\]\s*\{[^}]*scroll-margin-bottom:[^}]*--stm-bottom-h/);
  });
});

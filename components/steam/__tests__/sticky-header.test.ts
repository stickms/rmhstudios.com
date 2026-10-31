import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The Steam top bar stays pinned, and everything that depends on its height accounts for it. */
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
    expect(r).toMatch(/height:\s*calc\(100dvh - var\(--stm-header-h\)\)/);
  });

  it('keeps in-page anchors from landing under the header', () => {
    expect(css).toMatch(/\.steam \[id\]\s*\{[^}]*scroll-margin-top:[^}]*--stm-header-h/);
  });
});

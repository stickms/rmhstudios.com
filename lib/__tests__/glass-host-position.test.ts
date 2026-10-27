import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A glass role host hangs its haze and rim canvases off `position: absolute;
 * inset: 0`, so the host must be positioned. The de-stick rule in radial.css
 * used to force `position: static !important` on sticky page chrome, which
 * handed those canvases to `<main>` and painted a gray column the height of the
 * whole page behind /shop (and every page with a `.glass-chrome` header).
 */
describe('de-stuck page chrome stays a positioned glass host', () => {
  const css = readFileSync(resolve(__dirname, '../../components/radial/radial.css'), 'utf8');

  it('unpins sticky chrome with relative, never static', () => {
    const at = css.indexOf('.radial-shell__main .sticky:not(.site-sticky-pinned)');
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf('}', at));
    expect(block).toMatch(/position:\s*relative\s*!important/);
    expect(block).not.toMatch(/position:\s*static/);
  });
});

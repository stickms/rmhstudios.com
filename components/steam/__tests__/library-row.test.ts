import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** A library row is a link plus the favourite star, side by side in one wrapper; highlights belong to the wrapper. */
const css = readFileSync(join(__dirname, '..', 'steam.css'), 'utf8');

describe('library list rows', () => {
  it('highlights the whole row, favourite star included, on hover', () => {
    expect(css).toMatch(/\.stm-row:hover,\s*\.stm-row-wrap:hover\s*\{[^}]*background:/);
  });

  it('highlights the whole row, favourite star included, when it is the selected title', () => {
    // On the link alone the selected highlight stops short of the star button beside it.
    expect(css).toMatch(
      /\.stm-row-wrap:has\(>\s*\.stm-row\[aria-current='page'\]\)\s*\{[^}]*background:\s*var\(--stm-hover\)/,
    );
  });
});

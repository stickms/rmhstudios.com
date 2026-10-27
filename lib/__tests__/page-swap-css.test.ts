import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');
const flat = css.replace(/\s+/g, ' ');

describe('the quick page swap (docs/superpowers/specs/2026-10-27-smooth-transitions-design.md)', () => {
  it('has three tokens: how far the old page dims, how fast it leaves, how fast the new one enters', () => {
    for (const t of ['--swap-dim', '--swap-out', '--swap-in']) expect(css).toContain(`${t}:`);
    const ms = (t: string) => Number(new RegExp(`${t}:\\s*(\\d+)ms`).exec(css)?.[1]);
    expect(ms('--swap-out')).toBeLessThanOrEqual(80);
    expect(ms('--swap-in')).toBeLessThanOrEqual(140);
    expect(Number(/--swap-dim:\s*([\d.]+)/.exec(css)?.[1])).toBeGreaterThanOrEqual(0.5); // never blank
  });

  it('page-enter is opacity only: no rise, no translate', () => {
    const m = /@keyframes page-enter \{([^}]*\{[^}]*\}[^}]*\{[^}]*\}[^}]*)\}/.exec(css);
    expect(m, 'the page-enter keyframes').toBeTruthy();
    expect(m![1]).toContain('opacity: var(--swap-dim)');
    expect(m![1]).not.toMatch(/translate|transform/);
    expect(flat).toMatch(/\.page-root > \* \{ animation: page-enter var\(--swap-in\)/);
  });

  it('the old page dims while it leaves, and only its content when the frame is shared', () => {
    expect(flat).toMatch(
      /html\[data-page-leaving\] \.page-root > \*[^{]*\{[^}]*opacity: var\(--swap-dim\)/,
    );
    expect(flat).toMatch(/html\[data-nav-kind='sibling'\] \.page-root > \* \{[^}]*animation: none/);
    // The frame (title, tab strip) is exempt: the swap is keyed to what is NOT the frame.
    expect(flat).toContain(":not([data-slot='page-controls'])");
  });
});

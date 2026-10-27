import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../jelly-group.css');
const tsx = read('../jelly-group.tsx');
const globals = read('../../../app/globals.css');
const radial = read('../../radial/radial.css');
const flat = (s: string) => s.replace(/\s+/g, ' ');

describe('jelly-group.css contract', () => {
  it("lives in the components layer, so a caller's utility class beats the member defaults", () => {
    // Unlayered CSS beats every layered Tailwind utility whatever the specificity (hidden, px-2, font-semibold...).
    expect(globals).toMatch(
      /@import ['"]\.\.\/components\/ui\/jelly-group\.css['"] layer\(components\);/,
    );
    expect(tsx).not.toMatch(/import ['"]\.\/jelly-group\.css['"]/);
  });

  it('the touch-target floor outranks the small size on coarse pointers', () => {
    const m = /@media \(pointer: coarse\) \{([\s\S]*?)\n\}/.exec(css);
    expect(m, 'a coarse-pointer block').toBeTruthy();
    expect(flat(m![1])).toContain("[data-size='sm'] [data-slot='jelly-group-item']");
    expect(flat(m![1])).toContain('min-height: var(--site-touch-target)');
  });

  it('hover glow only wakes where there is a hover (no sticky glow after a tap)', () => {
    const m = /@media \(hover: hover\) and \(pointer: fine\) \{([\s\S]*?)\n\}/.exec(css);
    expect(m, 'a hover block').toBeTruthy();
    expect(flat(m![1])).toContain(':hover');
  });

  it('a link member selects through any aria-current but "false"', () => {
    expect(css).toContain(":not([aria-current='false'])");
  });

  it('a disabled selected member dims its glow instead of dropping it', () => {
    expect(flat(css)).toMatch(/\[data-selected\]:disabled/);
  });
});

describe('phone width rule', () => {
  it('leaves a tab strip or search that shares a line with a button in its own row', () => {
    const rule = flat(radial.slice(radial.indexOf('--page-controls-inset: 1rem')));
    expect(rule).toMatch(/:only-child:not\([^)]*\.flex-1/);
  });
});

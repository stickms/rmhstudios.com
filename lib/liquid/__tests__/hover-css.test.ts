import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import { materialHover } from '../hover-css';

const compile = async (css: string) =>
  (await postcss([materialHover()]).process(css, { from: undefined })).css;

describe('material hover CSS policy', () => {
  it('places guards before pseudo-elements so production CSS minification stays valid', async () => {
    const css = await compile('::-webkit-scrollbar-thumb:hover { filter: brightness(2) }');
    expect(css).toContain(':not(*)::-webkit-scrollbar-thumb');
    expect(css).not.toContain('::-webkit-scrollbar-thumb:not');
  });
  it('keeps quiet colour feedback and removes host movement while keeping focus, selection and disabled states', async () => {
    const css = await compile(`.button { color: black; background: white }
      .button:hover, .button:focus-visible { color: red; background: blue; transform: translateY(-2px); text-decoration: underline }
      .button[aria-selected=true] { background: green }
      .button:disabled { opacity: .4 }`);
    expect(css).toContain('.button:not(*), .button:focus-visible');
    const result = postcss.parse(css);
    const hover = result.nodes.find(
      (n) => n.type === 'rule' && n.selector === '.button:hover, .button:focus-visible',
    );
    expect(hover?.toString()).not.toMatch(/transform:/);
    expect(hover?.toString()).toContain('color: red');
    expect(hover?.toString()).toContain('background: blue');
    expect(hover?.toString()).toContain('text-decoration: underline');
    expect(css).toContain('background: green');
    expect(css).toContain('opacity: .4');
  });

  it("lets the CSS soft body's hover pose through, and only that", async () => {
    // app/jelly-material.css §8: the soft body is CSS now, and its hover plump/dent is the one sanctioned writer.
    const css =
      await compile(`html:not(.native-material) .glass-fill:hover { scale: var(--jelly-hover-plump) }
      html:not(.native-material) button:hover { scale: var(--jelly-hover-dent); color: red }`);
    expect(css).toContain('.glass-fill:hover { scale: var(--jelly-hover-plump) }');
    expect(css).toMatch(/button:hover \{ scale: var\(--jelly-hover-dent\); color: red \}/);
    // The size-capped form the sheet actually ships (app/jelly-material.css §8) passes too.
    const cap =
      'min(var(--jelly-hover-plump), calc(1 + var(--jelly-edge-reach) / var(--jelly-s, 1000)))';
    expect(await compile(`.glass-fill:hover { scale: ${cap} }`)).toBe(
      `.glass-fill:hover { scale: ${cap} }`,
    );
    // …however Prettier wraps it.
    const wrapped = `.glass-fill:hover {\n  scale: min(\n    var(--jelly-hover-plump),\n    calc(1 + var(--jelly-edge-reach) / var(--jelly-s, 1000))\n  );\n}`;
    expect(await compile(wrapped)).toBe(wrapped);
    const dent =
      'max(var(--jelly-hover-dent), calc(1 - var(--jelly-edge-reach) / var(--jelly-s, 1000)))';
    expect(await compile(`button:hover { scale: ${dent} }`)).toBe(
      `button:hover { scale: ${dent} }`,
    );
    // A hand-written lift, a pose computed from the token, or a raw value is still a second writer.
    const lifts = await compile(`.card:hover { scale: 1.02 }
      .tile:hover { scale: calc(var(--jelly-hover-plump) * 1.01) }
      .chip:hover { translate: var(--my-lift) }`);
    const root = postcss.parse(lifts);
    root.walkRules((rule) => {
      if (rule.selector.includes(':hover'))
        expect(rule.toString()).not.toMatch(/scale:|translate:/);
    });
  });

  it('handles nested Tailwind variants and escaped class names', async () => {
    const css = await compile(
      String.raw`.hover\:bg-site-accent { &:hover { @media (hover:hover) { background-color: red; --tw-shadow-color: blue } } }`,
    );
    const root = postcss.parse(css);
    root.walkRules((rule) => {
      if (rule.selector === '&:hover') expect(rule.toString()).toContain('background-color:');
    });
    expect(css).toContain('&:hover');
  });

  it('preserves hover and focus colours inside functional selectors', async () => {
    const css = await compile('.button:is(:hover, :focus-visible) { color: red }');
    expect(css).toContain(':is(:hover, :focus-visible)');
    expect(css).toContain('color: red');
  });

  it('keeps resting :not(:hover) rules and ignores commas in attributes', async () => {
    const css = await compile('[data-name="a,b"]:not(:hover) { color: blue }');
    expect(css).toBe('[data-name="a,b"]:not(:hover) { color: blue }');
  });

  it('keeps content reveals and the shared pseudo-element state animation', async () => {
    const css =
      await compile(`.group:hover .tooltip { opacity: 1; transform: translateY(0); color: red }
      [data-evert]:hover::before { scale: 1 }`);
    expect(css).toContain('opacity: 1');
    expect(css).toContain('transform: translateY(0)');
    expect(css).toContain('[data-evert]:hover::before { scale: 1 }');
  });

  it('keeps nested hover colours in mixed focus ancestors', async () => {
    const css = await compile(
      '.card:is(:hover,:focus-visible) { color: red; .child:hover { background: blue } }',
    );
    expect(css).toMatch(/\.child:hover\s*\{\s*background/);
  });

  it('handles synthetic declarations without source offsets', async () => {
    const root = postcss.root();
    root.append(
      postcss
        .rule({ selector: 'button:hover' })
        .append({ prop: 'filter', value: 'brightness(2)' }, { prop: 'opacity', value: '1' }),
    );
    const result = await postcss([materialHover()]).process(root, { from: undefined });
    const stable = result.root.first;
    expect(stable?.toString()).toContain('filter: brightness(2)');
    expect(stable?.toString()).not.toContain('opacity');
  });
});

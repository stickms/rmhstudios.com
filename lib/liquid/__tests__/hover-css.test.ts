import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import { materialHover } from '../hover-css';

const compile = async (css: string) =>
  (await postcss([materialHover()]).process(css, { from: undefined })).css;

describe('material hover CSS policy', () => {
  it('places guards before pseudo-elements so production CSS minification stays valid', async () => {
    const css = await compile('::-webkit-scrollbar-thumb:hover { background-color: red }');
    expect(css).toContain(':not(*)::-webkit-scrollbar-thumb');
    expect(css).not.toContain('::-webkit-scrollbar-thumb:not');
  });
  it('replaces hover colour and host movement while keeping focus, selection and disabled states', async () => {
    const css = await compile(`.button { color: black; background: white }
      .button:hover, .button:focus-visible { color: red; background: blue; transform: translateY(-2px); text-decoration: underline }
      .button[aria-selected=true] { background: green }
      .button:disabled { opacity: .4 }`);
    expect(css).toContain('.button:not(*), .button:focus-visible');
    const result = postcss.parse(css);
    const hover = result.nodes.find(
      (n) => n.type === 'rule' && n.selector === '.button:hover, .button:focus-visible',
    );
    expect(hover?.toString()).not.toMatch(/color:|background:|transform:/);
    expect(hover?.toString()).toContain('text-decoration: underline');
    expect(css).toContain('background: green');
    expect(css).toContain('opacity: .4');
  });

  it('handles nested Tailwind variants and escaped class names', async () => {
    const css = await compile(
      String.raw`.hover\:bg-site-accent { &:hover { @media (hover:hover) { background-color: red; --tw-shadow-color: blue } } }`,
    );
    const root = postcss.parse(css);
    root.walkRules((rule) => {
      if (rule.selector === '&:hover') expect(rule.toString()).not.toContain('background-color:');
    });
    expect(css).toContain('&:not(*)');
  });

  it('preserves alternate focus branches inside functional selectors', async () => {
    const css = await compile('.button:is(:hover, :focus-visible) { color: red }');
    expect(css).toContain(':is(:not(*), :focus-visible)');
    expect(css).not.toMatch(/:is\(:hover, :focus-visible\)\s*\{\s*color/);
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

  it('normalizes nested hover colours even in mixed focus ancestors', async () => {
    const css = await compile(
      '.card:is(:hover,:focus-visible) { color: red; .child:hover { background: blue } }',
    );
    expect(css).not.toMatch(/\.child:hover\s*\{\s*background/);
  });

  it('handles synthetic declarations without source offsets', async () => {
    const root = postcss.root();
    root.append(
      postcss
        .rule({ selector: 'button:hover' })
        .append({ prop: 'color', value: 'red' }, { prop: 'opacity', value: '1' }),
    );
    const result = await postcss([materialHover()]).process(root, { from: undefined });
    const stable = result.root.first;
    expect(stable?.toString()).toContain('color: red');
    expect(stable?.toString()).not.toContain('opacity');
  });
});

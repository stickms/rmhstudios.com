/**
 * The spine (Steel section 7). The suite is `node` (no DOM), so markup is asserted through `renderToStaticMarkup` and the
 * CSS contract through the stylesheet.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Spine, SpineItem, SpineStation } from '../spine';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Spine primitives (plan section 7)', () => {
  it('Spine is a div.spine and passes ARIA props through, so a feed can be role="feed"', () => {
    const html = renderToStaticMarkup(
      <Spine role="feed" aria-label="Feed" className="extra">
        <SpineItem as="article">a</SpineItem>
      </Spine>,
    );
    expect(html).toMatch(/^<div class="spine extra" role="feed" aria-label="Feed">/);
    expect(html).toContain('<article class="spine-item">a</article>');
  });

  it('an item has a dot by default and none with dot={false} (P3)', () => {
    expect(renderToStaticMarkup(<SpineItem>x</SpineItem>)).toBe('<div class="spine-item">x</div>');
    expect(renderToStaticMarkup(<SpineItem dot={false}>x</SpineItem>)).toBe(
      '<div class="spine-item" data-dot="false">x</div>',
    );
  });

  it('an item can be any of div, article, section and keeps its own props', () => {
    expect(
      renderToStaticMarkup(
        <SpineItem as="section" aria-label="r">
          x
        </SpineItem>,
      ),
    ).toBe('<section class="spine-item" aria-label="r">x</section>');
  });

  it('a station is a real h2 in the t-label type class', () => {
    expect(renderToStaticMarkup(<SpineStation>This week</SpineStation>)).toBe(
      '<h2 class="spine-station t-label">This week</h2>',
    );
  });

  it('the component file has no hooks, effects or client-only imports (P1)', () => {
    const src = read('spine.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/\buse[A-Z]\w*\s*\(/);
    expect(src.match(/^import .* from 'react';$/gm)).toEqual([
      "import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';",
    ]);
    expect(src).not.toMatch(
      /useEffect|useLayoutEffect|useState|useRef|ResizeObserver|IntersectionObserver/,
    );
  });
});

describe('Spine stylesheet (plan section 7, P1, P2, P5)', () => {
  const css = read('spine.css').replace(/\/\*[\s\S]*?\*\//g, '');

  it('carries the plan geometry', () => {
    expect(css).toMatch(/\.spine \{[^}]*padding-inline-start: 20px/);
    expect(css).toMatch(
      /\.spine::before \{[^}]*inset-inline-start: 4px;[^}]*inset-block-start: 6px;[^}]*inline-size: 1px/,
    );
    expect(css).toMatch(
      /\.spine-item \{[^}]*padding-block: 14px;[^}]*border-block-end: 1px solid var\(--site-border\)/,
    );
    expect(css).toMatch(
      /\.spine-item::before \{[^}]*inset-inline-start: -18\.5px;[^}]*inset-block-start: 21px;[^}]*inline-size: 6px;[^}]*block-size: 6px/,
    );
    expect(css).toContain('box-shadow: 0 0 0 3px var(--site-bg)');
    expect(css).toMatch(/\.spine-station \{[^}]*padding-block: 22px 8px/);
    expect(css).toMatch(
      /\.spine-station::before \{[^}]*inset-inline-start: -20\.5px;[^}]*inset-block-start: 25px;[^}]*inline-size: 8px/,
    );
  });

  it('uses logical properties only, so it mirrors in ar and ur (P5)', () => {
    expect(css).not.toMatch(
      /(^|[\s{;])(left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right)\s*:/m,
    );
    expect(css).not.toMatch(/\[dir=/);
  });

  it('is static: no animation, transition, transform or gradient (P1, R1, R5)', () => {
    expect(css).not.toMatch(/animation|transition|@keyframes|transform|gradient|filter/);
  });

  it('allows one nested level at 8px for replies to a reply (P2)', () => {
    expect(css).toMatch(/\.spine \.spine \{[^}]*margin-inline-start: 8px/);
    expect(css).not.toMatch(/\.spine \.spine \.spine/);
  });
});

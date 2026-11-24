import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { Cells, Columns, Definition, Definitions, Notice, Section } from '../rules';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../../../app/styles/steel-rules.css'), 'utf8');

/** Every `selector { body }` pair in the stylesheet, innermost first (so @container contents are included). */
function ruleBlocks(): Array<[string, string]> {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    (m) => [m[1]!.trim().replace(/\s+/g, ' '), m[2]!] as [string, string],
  );
}

/** The body of the one rule whose selector is exactly `selector`; fails the test if there is none. */
function bodyOf(selector: string): string {
  const hit = ruleBlocks().find(([s]) => s === selector);
  if (!hit) throw new Error(`no rule for selector: ${selector}`);
  return hit[1];
}

describe('Section', () => {
  it('renders a titled section with an h2 heading labelled by aria-labelledby', () => {
    const html = renderToStaticMarkup(
      <Section id="billing" title="Billing">
        <p>body</p>
      </Section>,
    );
    expect(html).toMatch(/^<section[^>]*class="rule-section"/);
    expect(html).toContain('id="billing"');
    const heading = html.match(/<h2 id="([^"]+)" class="t-heading text-site-text">Billing<\/h2>/);
    expect(heading).not.toBeNull();
    const headingId = heading![1];
    expect(html).toContain(`aria-labelledby="${headingId}"`);
  });

  it('renders no heading and no labelledby without a title', () => {
    const html = renderToStaticMarkup(
      <Section>
        <p>body</p>
      </Section>,
    );
    expect(html).not.toContain('<h2');
    expect(html).not.toContain('aria-labelledby');
  });
});

describe('Columns', () => {
  it('renders a rule-cols container with data-ratio', () => {
    const html = renderToStaticMarkup(
      <Columns ratio="3-2">
        <div>a</div>
        <div>b</div>
      </Columns>,
    );
    expect(html).toMatch(/^<div class="rule-cols" data-ratio="3-2"/);
  });

  it('defaults to 1-1 and survives a single child', () => {
    const html = renderToStaticMarkup(
      <Columns>
        <div>only</div>
      </Columns>,
    );
    expect(html).toContain('data-ratio="1-1"');
    expect(html.match(/<div/g)?.length).toBe(2);
  });

  it('renders nothing extra for an empty child list', () => {
    const html = renderToStaticMarkup(<Columns>{null}</Columns>);
    expect(html).toBe('<div class="rule-cols" data-ratio="1-1"></div>');
  });
});

describe('Cells', () => {
  it('renders a ul with data-columns and li children', () => {
    const html = renderToStaticMarkup(
      <Cells columns={3}>
        <li>a</li>
        <li>b</li>
      </Cells>,
    );
    expect(html).toMatch(/^<ul class="rule-cells" data-columns="3"/);
    expect(html.match(/<li/g)?.length).toBe(2);
  });

  it('marks the items of the last row so ragged rows leave no outer rule', () => {
    const html = renderToStaticMarkup(
      <Cells columns={3}>
        <li>1</li>
        <li>2</li>
        <li>3</li>
        <li>4</li>
        <li>5</li>
      </Cells>,
    );
    const items = html.match(/<li[^>]*>/g) ?? [];
    expect(items).toHaveLength(5);
    expect(items.slice(0, 3).every((tag) => !tag.includes('data-last-row'))).toBe(true);
    expect(items.slice(3).every((tag) => tag.includes('data-last-row'))).toBe(true);
  });
});

describe('Notice', () => {
  it('uses role alert for danger and role status for success', () => {
    const danger = renderToStaticMarkup(<Notice tone="danger">no</Notice>);
    const success = renderToStaticMarkup(<Notice tone="success">yes</Notice>);
    expect(danger).toContain('class="rule-notice"');
    expect(danger).toContain('data-tone="danger"');
    expect(danger).toContain('role="alert"');
    expect(success).toContain('data-tone="success"');
    expect(success).toContain('role="status"');
  });
});

describe('Definitions', () => {
  it('renders a dl with rows of dt (label) before dd (value)', () => {
    const html = renderToStaticMarkup(
      <Definitions>
        <Definition label="Plan">Pro</Definition>
      </Definitions>,
    );
    expect(html).toMatch(/^<dl class="rule-defs">/);
    const dt = html.indexOf('<dt class="t-label">Plan</dt>');
    const dd = html.indexOf('<dd class="t-body text-site-text">Pro</dd>');
    expect(dt).toBeGreaterThan(-1);
    expect(dd).toBeGreaterThan(dt);
  });
});

describe('steel-rules.css', () => {
  it('resets the first section and draws no vertical rule outside a container query', () => {
    expect(css).toMatch(/\.rule-section:first-child\s*\{[^}]*border-block-start:\s*0/);
    expect(css).toMatch(/\.rule-section:first-child\s*\{[^}]*padding-block-start:\s*0/);
    expect(css).toMatch(/\.rule-section:first-child\s*\{[^}]*margin-block-start:\s*0/);
    const outside = css
      .replace(/@container[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, '')
      .replace(/\.rule-notice[^{]*\{[^}]*\}/g, '');
    expect(outside).not.toMatch(/border-inline-start/);
  });

  it('draws Cells rules only between cells: start rules on inner columns, no bottom rule on the last row', () => {
    expect(bodyOf(".rule-cells[data-columns='2'] > li:nth-child(2n)")).toMatch(/border-inline-start:\s*1px/);
    expect(bodyOf(".rule-cells[data-columns='3'] > li:not(:nth-child(3n + 1))")).toMatch(/border-inline-start:\s*1px/);
    expect(bodyOf(".rule-cells[data-columns='4'] > li:not(:nth-child(4n + 1))")).toMatch(/border-inline-start:\s*1px/);
    // The outer edge: the last item and every last-row item lose their bottom rule.
    expect(bodyOf('.rule-cells > li:last-child')).toMatch(/border-block-end:\s*0/);
    expect(bodyOf('.rule-cells > li[data-last-row]')).toMatch(/border-block-end:\s*0/);
    // No rule is drawn on an inline-end edge, and no cell rule on the first column's start edge.
    expect(css).not.toMatch(/border-inline-end/);
    for (const [selector, body] of ruleBlocks()) {
      if (selector.includes('rule-cells') && /border-inline-start/.test(body)) {
        expect(selector).not.toMatch(/:first-child|:nth-child\(1\)|nth-child\(n\)/);
      }
    }
  });

  it('draws the Columns gutter only after a sibling, never on a single child', () => {
    // The vertical rule is a pseudo-element on `* + *`, so a lone child has no preceding sibling to draw it.
    expect(bodyOf('.rule-cols > * + *::before')).toMatch(/inset-inline-start:\s*-0\.75rem/);
    for (const [selector, body] of ruleBlocks()) {
      if (selector.includes('rule-cols') && /border-inline-start/.test(body)) {
        throw new Error(`a Columns rule applies without a sibling combinator: ${selector}`);
      }
    }
  });

  it('keeps the 3:2 split exact: the gutter is the column gap, not padding on a flex item', () => {
    expect(bodyOf('.rule-cols')).toMatch(/column-gap:\s*1\.5rem/);
    expect(bodyOf(".rule-cols[data-ratio='3-2'] > *:nth-child(1)")).toMatch(/flex-grow:\s*3/);
    expect(bodyOf(".rule-cols[data-ratio='3-2'] > *:nth-child(2)")).toMatch(/flex-grow:\s*2/);
    for (const [selector, body] of ruleBlocks()) {
      if (selector.includes('rule-cols')) {
        expect(body, selector).not.toMatch(/padding-inline-start/);
      }
    }
  });

  it('uses only logical properties and no effects', () => {
    for (const banned of [
      'gradient',
      'shadow',
      'blur',
      'transition',
      'animation',
      'border-left',
      'border-right',
      'margin-left',
      'margin-right',
      'padding-left',
      'padding-right',
    ]) {
      expect(css.toLowerCase()).not.toContain(banned);
    }
  });

  it('draws every colour from a --site token', () => {
    const colours = css.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi);
    expect(colours ?? []).toEqual([]);
  });
});

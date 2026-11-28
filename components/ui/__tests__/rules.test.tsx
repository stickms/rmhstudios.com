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

/** The body of the rule whose selector list matches or includes `selector`; fails the test if there is none. */
function bodyOf(selector: string): string {
  const hit = ruleBlocks().find(([s]) => s === selector || s.split(',').some((part) => part.trim() === selector));
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

/** Every rule block whose selector is exactly `selector` (a selector can appear in a narrow and a wide block). */
function bodiesOf(selector: string): string[] {
  const hits = ruleBlocks().filter(([s]) => s === selector);
  if (hits.length === 0) throw new Error(`no rule for selector: ${selector}`);
  return hits.map(([, body]) => body);
}

describe('steel-rules.css', () => {
  it('resets the first section: no rule, no padding and no margin', () => {
    expect(bodyOf('.rule-section:first-child')).toMatch(/padding-block-start:\s*0/);
    expect(bodyOf('.rule-section:first-child')).toMatch(/margin-block-start:\s*0/);
    expect(bodyOf('.rule-section:first-child::before')).toMatch(/display:\s*none/);
  });

  it('draws no vertical rule outside a container query', () => {
    // A vertical rule is a 1px-wide pseudo-element (`inline-size: 1px`); the wide layouts are the only place for one.
    const outside = css.replace(/@container[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
    expect(outside).not.toMatch(/inline-size:\s*1px/);
  });

  it('floats every rule: horizontals stop short of the sides, verticals short of the rules above and below', () => {
    for (const selector of [
      '.rule-section::before',
      '.rule-cols > * + *::before',
      '.rule-cells > li::after',
      '.rule-notice::after',
      '.rule-defs > div::after',
      '.rule-row::after',
    ]) {
      expect(bodiesOf(selector).join(' '), selector).toMatch(/inset-inline:\s*var\(--rule-inset\)/);
    }
    for (const selector of [
      '.rule-cols > * + *::before',
      '.rule-defs > div::before',
      ".rule-cells[data-columns='2'] > li:nth-child(2n)::before, .rule-cells[data-columns='3'] > li:not(:nth-child(3n + 1))::before, .rule-cells[data-columns='4'] > li:not(:nth-child(4n + 1))::before",
    ]) {
      expect(bodiesOf(selector).join(' '), selector).toMatch(/inset-block:\s*var\(--rule-gap\)/);
    }
    expect(css).toMatch(/--rule-inset:\s*0\.75rem/);
    expect(css).toMatch(/--rule-gap:\s*0\.75rem/);
  });

  it('draws Cells rules only between cells: vertical rules on inner columns, no bottom rule on the last row', () => {
    const inner = bodiesOf(
      ".rule-cells[data-columns='2'] > li:nth-child(2n)::before, .rule-cells[data-columns='3'] > li:not(:nth-child(3n + 1))::before, .rule-cells[data-columns='4'] > li:not(:nth-child(4n + 1))::before",
    ).join(' ');
    expect(inner).toMatch(/inline-size:\s*1px/);
    expect(inner).toMatch(/inset-inline-start:\s*0/);
    // The outer edge: the last item and every last-row item lose their bottom rule.
    expect(bodyOf('.rule-cells > li:last-child::after')).toMatch(/display:\s*none/);
    expect(bodyOf('.rule-cells > li[data-last-row]::after')).toMatch(/display:\s*none/);
    // No rule on an inline-end edge, and no vertical rule on the first column.
    expect(css).not.toMatch(/inset-inline-end|border-inline-end/);
    for (const [selector, body] of ruleBlocks()) {
      if (selector.includes('rule-cells') && /inline-size:\s*1px/.test(body)) {
        expect(selector).not.toMatch(/:first-child|:nth-child\(1\)|nth-child\(n\)/);
      }
    }
  });

  it('draws the Columns rules only after a sibling, never on a single child', () => {
    // Every Columns rule is a pseudo-element on `* + *`, so a lone child has no preceding sibling to draw it.
    for (const [selector, body] of ruleBlocks()) {
      if (selector.includes('rule-cols') && /::before/.test(selector)) {
        expect(selector).toContain('* + *');
      }
      if (selector.includes('rule-cols') && !selector.includes('* + *')) {
        expect(body, selector).not.toMatch(/inline-size:\s*1px/);
      }
    }
    expect(bodiesOf('.rule-cols > * + *::before').join(' ')).toMatch(/inline-size:\s*1px/);
    expect(bodiesOf('.rule-cols > * + *::before').join(' ')).toMatch(/inset-inline-start:\s*-0\.75rem/);
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

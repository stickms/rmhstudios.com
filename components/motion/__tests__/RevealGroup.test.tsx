/**
 * RevealGroup / RevealItem — render-to-string tests.
 *
 * Rewritten 2026-08-12 with the component. See the note at the top of
 * `Reveal.test.tsx`: the "children start hidden" assertion these tests used to
 * make was asserting the AUD-006 bug, not guarding against it. The cascade now
 * comes from `.u-reveal-group > *` nth-child range shifts in globals.css, so
 * nothing about it is observable in the SSR string except the class — and the
 * thing worth asserting is that the server output is never hidden.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import { RevealGroup, RevealItem } from '../RevealGroup';

describe('RevealGroup', () => {
  it('renders its children', () => {
    const html = renderToString(
      <RevealGroup>
        <RevealItem>a</RevealItem>
        <RevealItem>b</RevealItem>
      </RevealGroup>,
    );
    expect(html).toContain('a');
    expect(html).toContain('b');
  });

  it('never server-renders a hidden state (the AUD-006 guarantee)', () => {
    const html = renderToString(
      <RevealGroup>
        <RevealItem>item</RevealItem>
      </RevealGroup>,
    );
    expect(html).not.toContain('opacity:0');
    expect(html).not.toContain('translateY');
    expect(html).toContain('item');
  });

  it('carries the u-reveal-group class that drives the child cascade', () => {
    const html = renderToString(
      <RevealGroup>
        <RevealItem>x</RevealItem>
      </RevealGroup>,
    );
    expect(html).toContain('u-reveal-group');
  });

  it('leaves items themselves unclassed — the cascade is the parent rule', () => {
    // RevealItem must not carry `u-reveal` of its own, or a child would run two
    // competing animations (its own entry plus the group's).
    const html = renderToString(
      <RevealGroup>
        <RevealItem className="only-mine">x</RevealItem>
      </RevealGroup>,
    );
    expect(html).toMatch(/class="only-mine"/);
  });

  it('converts the group delay into a scroll-range shift', () => {
    const html = renderToString(
      <RevealGroup delay={0.12}>
        <RevealItem>x</RevealItem>
      </RevealGroup>,
    );
    expect(html).toContain('--u-reveal-shift:10%');
  });

  it('forwards className and honors `as`', () => {
    const html = renderToString(
      <RevealGroup as="ul" className="grp">
        <RevealItem as="li">x</RevealItem>
      </RevealGroup>,
    );
    expect(html).toMatch(/<ul[^>]*class="[^"]*grp/);
    expect(html).toMatch(/<li/);
  });
});

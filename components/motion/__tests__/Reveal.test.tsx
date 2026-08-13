/**
 * Reveal — render-to-string tests (node env, no DOM lib).
 * Asserts on the emitted HTML string.
 *
 * These tests changed shape on 2026-08-12 along with the component. They used to
 * assert the OPPOSITE of what they assert now — `expect(html).toContain('opacity:0')`
 * — because the reveal was a framer-motion node that emitted its hidden `initial`
 * state as an inline style during SSR.
 *
 * That inline `opacity:0` was the AUD-006 bug: server-rendered HTML that is
 * invisible until JavaScript rescues it, in a component used in 34 places. The
 * reveal is now a CSS class whose hidden state exists only inside `@supports
 * (animation-timeline: view())`, so the server never emits a hidden state at all.
 *
 * The assertion below is therefore deliberately inverted and is the single most
 * important test in this file: **the SSR output must never be hidden.** If a
 * future change reintroduces an inline opacity/transform here, that is the
 * regression, and this is what catches it.
 *
 * See docs/performance-audit-2026-08-12.md §1.1.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import { Reveal } from '../Reveal';

describe('Reveal', () => {
  it('renders its children', () => {
    const html = renderToString(<Reveal>hello world</Reveal>);
    expect(html).toContain('hello world');
  });

  it('never server-renders a hidden state (the AUD-006 guarantee)', () => {
    const html = renderToString(<Reveal>content</Reveal>);
    expect(html).not.toContain('opacity:0');
    expect(html).not.toContain('translateY');
    // The content is present and unstyled-hidden — a no-JS/no-CSS render shows it.
    expect(html).toContain('content');
  });

  it('carries the u-reveal class that drives the scroll-timeline animation', () => {
    const html = renderToString(<Reveal>x</Reveal>);
    expect(html).toContain('u-reveal');
  });

  it('marks itself with data-reveal for the noscript rule in __root', () => {
    const html = renderToString(<Reveal>x</Reveal>);
    expect(html).toContain('data-reveal');
  });

  it('passes a custom y offset through as a custom property, not an inline transform', () => {
    const html = renderToString(<Reveal y={40}>content</Reveal>);
    expect(html).toContain('--u-reveal-y:40px');
    expect(html).not.toContain('translateY');
  });

  it('emits no style attribute at all when no overrides are given', () => {
    // The shared curve comes from --site-reveal-distance in globals.css; a bare
    // Reveal should add nothing per-element.
    const html = renderToString(<Reveal>x</Reveal>);
    expect(html).not.toContain('style=');
  });

  it('converts a delay into a scroll-range shift', () => {
    // A scroll timeline has no clock, so `delay` becomes `--u-reveal-shift`.
    const html = renderToString(<Reveal delay={0.06}>x</Reveal>);
    expect(html).toContain('--u-reveal-shift:5%');
  });

  it('clamps the range shift so a large delay cannot strand an element', () => {
    const html = renderToString(<Reveal delay={10}>x</Reveal>);
    expect(html).toContain('--u-reveal-shift:25%');
  });

  it('forwards className alongside u-reveal', () => {
    const html = renderToString(<Reveal className="my-class">x</Reveal>);
    expect(html).toContain('my-class');
    expect(html).toContain('u-reveal');
  });

  it('renders the requested element via `as`', () => {
    const html = renderToString(
      <Reveal as="section" className="sec">
        x
      </Reveal>,
    );
    expect(html).toMatch(/<section[^>]*class="[^"]*sec/);
  });
});

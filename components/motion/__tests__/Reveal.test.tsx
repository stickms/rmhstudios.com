/**
 * Reveal — render-to-string tests (node env, no DOM lib).
 * Asserts on the emitted HTML string.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

// Mockable reduced-motion hook — default: motion enabled.
const reduced = { value: false };
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => reduced.value,
  prefersReducedMotion: () => reduced.value,
}));

import { Reveal } from '../Reveal';

afterEach(() => {
  reduced.value = false;
});

describe('Reveal', () => {
  it('renders its children', () => {
    const html = renderToString(<Reveal>hello world</Reveal>);
    expect(html).toContain('hello world');
  });

  it('mounts a motion node with the initial (hidden) transform+opacity applied', () => {
    const html = renderToString(<Reveal>content</Reveal>);
    // framer-motion emits the `initial` variant to string during SSR.
    expect(html).toContain('opacity:0');
    expect(html).toContain('translateY(16px)');
  });

  it('honors a custom y offset', () => {
    const html = renderToString(<Reveal y={40}>content</Reveal>);
    expect(html).toContain('translateY(40px)');
  });

  it('forwards className', () => {
    const html = renderToString(<Reveal className="my-class">x</Reveal>);
    expect(html).toContain('my-class');
  });

  it('renders the requested element via `as`', () => {
    const html = renderToString(
      <Reveal as="section" className="sec">
        x
      </Reveal>,
    );
    expect(html).toMatch(/<section[^>]*class="sec"/);
  });

  it('under reduced motion renders a plain element with no motion styles', () => {
    reduced.value = true;
    const html = renderToString(<Reveal className="plain">visible</Reveal>);
    expect(html).toContain('visible');
    expect(html).toContain('plain');
    // No hidden initial state — content is not translated/faded out.
    expect(html).not.toContain('opacity:0');
    expect(html).not.toContain('translateY');
  });
});

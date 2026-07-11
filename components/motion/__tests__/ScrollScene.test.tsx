/**
 * ScrollScene — render-to-string tests for the pinned-narrative primitive.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

const reduced = { value: false };
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => reduced.value,
  prefersReducedMotion: () => reduced.value,
}));

import { ScrollScene } from '../ScrollScene';

afterEach(() => {
  reduced.value = false;
});

describe('ScrollScene', () => {
  it('renders a tall outer wrapper sized screens*100vh', () => {
    const html = renderToString(
      <ScrollScene screens={4}>{() => <div>stage</div>}</ScrollScene>,
    );
    expect(html).toContain('height:400vh');
  });

  it('defaults to 3 screens', () => {
    const html = renderToString(<ScrollScene>{() => <div>stage</div>}</ScrollScene>);
    expect(html).toContain('height:300vh');
  });

  it('renders a sticky stage pinned to the top', () => {
    const html = renderToString(
      <ScrollScene screens={2}>{() => <div>stage</div>}</ScrollScene>,
    );
    expect(html).toContain('position:sticky');
    expect(html).toContain('top:0');
    expect(html).toContain('100svh');
    expect(html).toContain('overflow:hidden');
  });

  it('passes a progress MotionValue to the render prop and renders its output', () => {
    const html = renderToString(
      <ScrollScene screens={2}>
        {(progress) => <div>{progress ? 'has-progress' : 'no-progress'}</div>}
      </ScrollScene>,
    );
    expect(html).toContain('has-progress');
  });

  it('under reduced motion stacks children statically — no sticky, no forced viewport height', () => {
    reduced.value = true;
    const html = renderToString(
      <ScrollScene screens={5}>{() => <div>static-content</div>}</ScrollScene>,
    );
    expect(html).toContain('static-content');
    expect(html).not.toContain('position:sticky');
    expect(html).not.toContain('500vh');
    expect(html).not.toContain('100svh');
  });
});

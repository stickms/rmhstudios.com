/**
 * SilentErrorBoundary — SSR-renderable behaviour + error-state logic.
 *
 * The full catch path (getDerivedStateFromError → fallback) only runs in a
 * client renderer, which this node-env suite has no DOM for. These tests instead
 * lock the two things that CAN regress silently: that the boundary is fully
 * transparent on the happy path (it wraps near-critical chrome, so it must never
 * swallow content when nothing threw), and that its error-state transition +
 * fallback selection are correct.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

// The boundary reports to the client-error beacon on catch; stub it so the
// import graph stays node-safe and we can assert reporting without a network.
vi.mock('@/lib/client-errors', () => ({ reportClientError: vi.fn() }));

import { SilentErrorBoundary } from '../SilentErrorBoundary';

describe('SilentErrorBoundary', () => {
  it('renders its children unchanged on the happy path', () => {
    const html = renderToString(
      <SilentErrorBoundary label="test">
        <div>visible child</div>
      </SilentErrorBoundary>,
    );
    expect(html).toContain('visible child');
  });

  it('flips to the error state when a child throws', () => {
    expect(SilentErrorBoundary.getDerivedStateFromError()).toEqual({ hasError: true });
  });

  it('renders null by default in the error state (silent)', () => {
    const boundary = new SilentErrorBoundary({ children: <div>child</div> });
    boundary.state = { hasError: true };
    expect(boundary.render()).toBeNull();
  });

  it('renders a provided fallback in the error state', () => {
    const fallback = <span>fallback</span>;
    const boundary = new SilentErrorBoundary({ children: <div>child</div>, fallback });
    boundary.state = { hasError: true };
    expect(boundary.render()).toBe(fallback);
  });
});

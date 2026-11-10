/**
 * OptimizationPage characterization (A6, batch 3). The page is split into
 * `optimization/*` data modules and section components; this pins the
 * server-rendered markup so the split is provably markup-neutral.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('@/components/security/security.css', () => ({}));
vi.mock('@/components/feed/PinnedHero', () => ({
  PinnedHero: (props: Record<string, unknown>) => (
    <div data-stub="PinnedHero">
      <p>{props.eyebrow as never}</p>
      <h1>{props.title as never}</h1>
      <p>{props.subtitle as never}</p>
      <p>{props.scrollCue as never}</p>
      <div>{props.actions as never}</div>
    </div>
  ),
}));

import { OptimizationPage } from '../../optimization/OptimizationPage';

describe('OptimizationPage characterization', () => {
  it('renders the full page', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    try {
      expect(renderToString(<OptimizationPage />)).toMatchSnapshot();
    } finally {
      vi.useRealTimers();
    }
  });
});

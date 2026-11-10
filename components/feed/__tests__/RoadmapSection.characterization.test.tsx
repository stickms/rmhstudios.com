/**
 * RoadmapSection characterization (A6, batch 3). The page is split into
 * `roadmap/*` data modules, a pure era model and sub-components; this pins the
 * server-rendered markup so the split is provably markup-neutral.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => String(o?.defaultValue ?? k),
  }),
}));
vi.mock('@/components/feed/PinnedHero', () => ({
  PinnedHero: (props: Record<string, unknown>) => (
    <div data-stub="PinnedHero">
      <h1>{props.title as never}</h1>
      <p>{props.eyebrow as never}</p>
      <p>{props.subtitle as never}</p>
      <p>{props.scrollCue as never}</p>
    </div>
  ),
}));
vi.mock('@/components/motion', () => {
  const box =
    (tag: string) =>
    ({ children, className, as }: { children?: unknown; className?: string; as?: string }) => {
      const Tag = (as ?? tag) as 'div';
      return <Tag className={className}>{children as never}</Tag>;
    };
  return { Reveal: box('div'), RevealGroup: box('div'), RevealItem: box('div') };
});

import { RoadmapSection } from '../../roadmap/RoadmapSection';

describe('RoadmapSection characterization', () => {
  it('renders the full timeline', () => {
    expect(renderToString(<RoadmapSection />)).toMatchSnapshot();
  });
});

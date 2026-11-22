// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name])),
  }),
}));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true }));

import { TypingStatsView, type KeyStatsData } from '../TypingStats';
import { keyMetrics } from '@/lib/rmhtype/keystats';

const noop = () => undefined;
const base = {
  layout: 'qwerty' as const,
  onLayoutChange: noop,
  onRetry: noop,
  onPractice: noop,
  practicing: false,
  onClear: noop,
  clearing: false,
};

const emptyStats: KeyStatsData = {
  layout: 'qwerty',
  keys: [],
  worst: [],
  summary: { totalAttempts: 0, totalErrors: 0, accuracy: 0, msPerKey: 0, impliedWpm: 0, trackedKeys: 0 },
};

describe('TypingStatsView', () => {
  it('says what is recorded', () => {
    const html = renderToStaticMarkup(<TypingStatsView {...base} status="ready" stats={emptyStats} />);
    expect(html).toContain('The order of what you typed is never stored.');
  });

  it('shows the empty state when no key has been recorded', () => {
    const html = renderToStaticMarkup(<TypingStatsView {...base} status="ready" stats={emptyStats} />);
    expect(html).toContain('No key data yet');
    expect(html).not.toContain('Practise these keys');
  });

  it('shows a labelled loading state and an error with a retry', () => {
    expect(renderToStaticMarkup(<TypingStatsView {...base} status="loading" stats={null} />)).toContain(
      'Loading your key statistics',
    );
    const failed = renderToStaticMarkup(<TypingStatsView {...base} status="error" stats={null} />);
    expect(failed).toContain('Could not load your key statistics.');
    expect(failed).toContain('Try again');
  });

  it('lists the worst keys as text, with the practice and clear actions', () => {
    const z = keyMetrics({ key: 'z', attempts: 20, errors: 10, totalMs: 6000 });
    const e = keyMetrics({ key: 'e', attempts: 40, errors: 1, totalMs: 6000 });
    const stats: KeyStatsData = {
      layout: 'qwerty',
      keys: [z, e],
      worst: [z, e],
      summary: {
        totalAttempts: 60,
        totalErrors: 11,
        accuracy: 0.8,
        msPerKey: 200,
        impliedWpm: 60,
        trackedKeys: 2,
      },
    };
    const html = renderToStaticMarkup(<TypingStatsView {...base} status="ready" stats={stats} />);
    expect(html).toContain('Worst keys');
    expect(html).toContain('300 ms per key, 50% missed');
    expect(html).toContain('150 ms per key, 3% missed');
    expect(html).toContain('Practise these keys');
    expect(html).toContain('Practice, not on the boards.');
    expect(html).toContain('Clear key stats');
  });
});

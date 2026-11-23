import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) => {
      const tpl =
        o.count === 1 && typeof o.defaultValue_one === 'string' ? (o.defaultValue_one as string) : o.defaultValue;
      return tpl.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k] ?? ''));
    },
    i18n: { language: 'en-US' },
  }),
}));

import { WaveNote } from './WaveNote';

describe('WaveNote', () => {
  it('lists the three latest waves, newest first, as calendar dates', () => {
    const html = renderToString(
      <WaveNote
        waves={[
          { date: '2026-10-28', count: 37, baseline: 4 },
          { date: '2026-11-04', count: 41, baseline: 5 },
          { date: '2026-09-01', count: 9, baseline: 2 },
          { date: '2026-11-12', count: 1, baseline: 0 },
        ]}
      />,
    );
    expect(html).toContain('t-meta');
    expect(html).toContain('Waves: Nov 12 (1 invite), Nov 4 (41 invites), Oct 28 (37 invites)');
    expect(html).not.toContain('Sep 1');
  });
  it('renders nothing without a wave', () => {
    expect(renderToString(<WaveNote waves={[]} />)).toBe('');
  });
});

import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ImportPreview } from './ImportPreview';
import { toEditable } from './model';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k] ?? '')),
    i18n: { language: 'en-US' },
  }),
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, ...rest }: { children: React.ReactNode; 'aria-label'?: string }) => (
    <select aria-label={rest['aria-label']}>{children}</select>
  ),
}));

const duke = { slug: 'duke', name: 'Duke University', shortName: 'Duke', degree: 'MD' as const, state: 'NC' };
const rows = toEditable({
  cycleYear: 2027,
  cycleFrom: 'dates',
  truncated: false,
  dropped: 0,
  tier: 'free',
  remainingToday: 1,
  dailyCap: 25,
  rows: [
    {
      key: 'duke|REG',
      schoolName: 'Duke',
      school: duke,
      program: 'REG',
      milestones: [
        { type: 'SUBMITTED', date: '2026-06-10', yearInferred: true, ambiguous: true, from: '' },
        { type: 'INTERVIEW', date: '2026-10-05', yearInferred: false, ambiguous: false, from: '' },
      ],
    },
    { key: 'x|REG', schoolName: 'Nowhere U', school: null, program: 'REG', milestones: [] },
  ],
});

describe('ImportPreview', () => {
  const html = renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <ImportPreview
        rows={rows}
        existingOf={() => new Map([['INTERVIEW', '2026-10-01']])}
        cycleYear={2027}
        now={new Date('2026-11-23T12:00:00Z')}
        onRows={() => undefined}
      />
    </QueryClientProvider>,
  );

  it('flags inferred years and ambiguous dates', () => {
    expect(html).toContain('The file had no year; 2026 was chosen');
    expect(html).toContain('could be the other way round');
  });
  it('shows the existing conflicting date and an unchecked replace box', () => {
    expect(html).toContain('Your tracker has');
    expect(html).toContain('Tick to replace it');
  });
  it('shows an unmatched school with a picker and its checkbox disabled', () => {
    expect(html).toContain('Could not match this school');
    expect(html).toContain('Nowhere U');
    expect(html).toMatch(/aria-label="Pick the school for/);
  });
});

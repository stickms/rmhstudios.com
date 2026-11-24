import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k] ?? '')),
    i18n: { language: 'en-US' },
  }),
}));

import { MSAR_PAGE_URL } from '../../engine/school-facts';
import type { MedSchoolFactDto, MedSchoolFactsRes } from '../../medschools.contract';
import { schoolFactsQuery } from '../../medschools.queries';
import { AdmissionsFacts, AdmissionsFactsView } from './AdmissionsFacts';

const fact = (kind: string, over: Partial<MedSchoolFactDto> = {}): MedSchoolFactDto => ({
  kind,
  reportId: 6996,
  report: 'Applications Accepted Information',
  cycleYear: 2027,
  value: null,
  printed: null,
  num: null,
  note: null,
  sourceUrl: 'https://students-residents.aamc.org/media/6996/download?attachment',
  sourceLabel: 'AAMC MSAR Report for Applicants and Advisors, 2027 entering class, Applications Accepted Information',
  checkedOn: '2026-11-24',
  ...over,
});

const data: MedSchoolFactsRes = {
  pageUrl: MSAR_PAGE_URL,
  facts: [
    fact('ACCEPTS_OUT_OF_STATE', { value: 'YES', note: 'Strong preference to residents.' }),
    fact('ACCEPTS_INTERNATIONAL', { value: 'CASE_BY_CASE' }),
    fact('ACCEPTS_DACA', { value: 'NO' }),
    fact('MCAT_LATEST', {
      reportId: 7036,
      report: 'Latest and Oldest MCAT Test Administration Dates Considered',
      value: '2026-09-12',
      printed: 'September 12, 2026',
      sourceLabel: 'AAMC MSAR Report for Applicants and Advisors, 2027 entering class, Latest and Oldest MCAT',
    }),
    fact('MCAT_OLDEST', { reportId: 7036, value: '2023-09', printed: 'September 2023' }),
    fact('DEPOSIT_DUE', {
      reportId: 7066,
      value: '2026-04-30',
      printed: 'April 30, 2026',
      sourceLabel: 'AAMC MSAR Report for Applicants and Advisors, 2026 entering class, Deposit Due Date',
    }),
    fact('COA_IN_STATE', { reportId: 7071, num: 69123, printed: '$69,123' }),
    fact('INTERVIEW_FORMAT', { reportId: 7051, value: 'Two one-on-one interviews.' }),
  ],
};

describe('AdmissionsFactsView', () => {
  const html = renderToString(<AdmissionsFactsView data={data} />);

  it('prints each fact, the school note and the dates in the reader language', () => {
    expect(html).toContain('Admissions facts');
    expect(html).toContain('Out-of-state applicants');
    expect(html).toContain('Case by case');
    expect(html).toContain('Strong preference to residents.');
    expect(html).toContain('September 12, 2026');
    expect(html).toContain('September 2023');
    expect(html).toContain('April 30, 2026');
    expect(html).toContain('$69,123');
    expect(html).toContain('Two one-on-one interviews.');
  });

  it('puts the source line, with its own entering class, and a link to the AAMC page on every block', () => {
    const blocks = html.split('medapp-subrule').slice(1);
    expect(blocks.length).toBe(5);
    for (const b of blocks) {
      expect(b).toContain('Source: AAMC MSAR Report for Applicants and Advisors, ');
      expect(b).toContain(`href="${MSAR_PAGE_URL}"`);
    }
    expect(html).toContain('2026 entering class, Deposit Due Date');
  });

  it('leaves out a fact the report did not give and never prints a blank', () => {
    expect(html).not.toContain('Fee waiver');
    expect(html).not.toContain('Total, out-of-state');
  });

  it('says so when a school has none', () => {
    const empty = renderToString(<AdmissionsFactsView data={{ pageUrl: MSAR_PAGE_URL, facts: [] }} />);
    expect(empty).toContain('No admissions facts for this school yet.');
    expect(empty).not.toContain('Source:');
  });

  it('uses the app tier: no site tokens and no shadow classes', () => {
    expect(html).not.toMatch(/--site-|shadow|surface-card/);
  });
});

describe('AdmissionsFacts (the section)', () => {
  const render = (degree: 'MD' | 'DO', seeded: boolean) => {
    const qc = new QueryClient();
    if (seeded) qc.setQueryData(schoolFactsQuery('yale').queryKey, data);
    return renderToString(
      <QueryClientProvider client={qc}>
        <AdmissionsFacts slug="yale" degree={degree} />
      </QueryClientProvider>,
    );
  };
  it('renders from the seeded public query for an MD school', () => {
    expect(render('MD', true)).toContain('Admissions facts');
  });
  it('renders nothing for a DO school, even with data', () => {
    expect(render('DO', true)).toBe('');
  });
});

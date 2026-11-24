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
import { Curriculum, CurriculumView } from './Curriculum';

const fact = (kind: string, over: Partial<MedSchoolFactDto> = {}): MedSchoolFactDto => ({
  kind,
  reportId: null,
  report: '',
  cycleYear: 0,
  value: null,
  printed: null,
  num: null,
  note: null,
  sourceUrl: 'https://admit.org',
  sourceLabel: 'Admit.org',
  checkedOn: '2026-11-24',
  page: null,
  ...over,
});

const data: MedSchoolFactsRes = {
  pageUrl: MSAR_PAGE_URL,
  facts: [
    fact('CURRICULUM_PRECLINICAL_GRADING', { value: 'PASS_FAIL', printed: 'P/F' }),
    fact('CURRICULUM_PRECLINICAL_LENGTH', { num: 1.5, printed: '1.5 Years' }),
    fact('CURRICULUM_CLERKSHIP_GRADING', { value: 'OTHER', printed: 'H/HP/SP/MP/F' }),
    fact('CURRICULUM_SHELF_EXAMS', { value: 'BOTH', printed: 'Both' }),
    fact('CURRICULUM_MSPE', { value: 'NO' }),
    fact('CURRICULUM_LECTURE_ATTENDANCE', { value: 'YES' }),
    fact('AOA_CHAPTER', { value: 'NO' }),
    fact('HOME_HOSPITALS', { printed: 'Fixture Alpha Hospital 1; Fixture Alpha Children’s Hospital' }),
    // an AAMC row on the same response is not this panel's business
    fact('ACCEPTS_OUT_OF_STATE', { reportId: 6996, value: 'YES', sourceLabel: 'AAMC MSAR Report' }),
  ],
};

describe('CurriculumView', () => {
  const html = renderToString(<CurriculumView data={data} />);

  it('titles the panel and prints the eight rows in order', () => {
    expect(html).toContain('>Curriculum<');
    const labels = [
      'Preclinical grading',
      'Preclinical length',
      'Clerkship grading',
      'Shelf exams',
      'MSPE',
      'Lecture attendance',
      'AOA chapter',
      'Home hospitals',
    ];
    const at = labels.map((l) => html.indexOf(`<dt>${l}</dt>`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('puts the normalised value in words and keeps Admit’s own string beside it', () => {
    expect(html).toContain('Pass / fail');
    expect(html).toContain('>P/F<');
    expect(html).toContain('1.5 years');
    expect(html).toContain('NBME and in-house exams');
    expect(html).toContain('Required');
    expect(html).toContain('<dt>AOA chapter</dt><dd>No</dd>');
  });

  it('shows the verbatim string alone when a scale cannot be normalised', () => {
    expect(html).toContain('<dt>Clerkship grading</dt><dd>H/HP/SP/MP/F</dd>');
  });

  it('lists the home hospitals one to a line', () => {
    expect(html).toContain('<li>Fixture Alpha Hospital 1</li>');
    expect(html).toContain('<li>Fixture Alpha Children’s Hospital</li>');
  });

  it('ends with the source line and its link, and the one muted sentence', () => {
    expect(html).toContain('Source: Admit.org, checked November 24, 2026');
    expect(html).toContain('data-href="https://admit.org"');
    expect(html).toContain('Compiled by Admit.org; confirm with the school.');
    expect(html).not.toContain('AAMC');
  });

  it('is empty-stated, with no source line, for a school Admit does not list', () => {
    const none = renderToString(<CurriculumView data={{ pageUrl: MSAR_PAGE_URL, facts: [data.facts.at(-1)!] }} />);
    expect(none).toContain('No curriculum details for this school yet.');
    expect(none).not.toContain('Source:');
  });

  it('leaves out a row Admit does not answer, and never prints a rank', () => {
    const some = renderToString(
      <CurriculumView data={{ pageUrl: MSAR_PAGE_URL, facts: [fact('AOA_CHAPTER', { value: 'YES' })] }} />,
    );
    expect(some).toContain('<dt>AOA chapter</dt><dd>Yes</dd>');
    expect(some).not.toContain('Clerkship grading');
    expect(html).not.toMatch(/rank/i);
  });

  it('uses the app tier: no site tokens and no shadow classes', () => {
    expect(html).not.toMatch(/--site-|shadow|surface-card/);
  });
});

describe('Curriculum (the section)', () => {
  it('renders from the seeded public query for a school of either degree', () => {
    const qc = new QueryClient();
    qc.setQueryData(schoolFactsQuery('yale').queryKey, data);
    const out = renderToString(
      <QueryClientProvider client={qc}>
        <Curriculum slug="yale" />
      </QueryClientProvider>,
    );
    expect(out).toContain('Curriculum');
    expect(out).toContain('Compiled by Admit.org');
  });
});

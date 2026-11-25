import { readCss } from '@/lib/__tests__/css-source';
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
import type { MedClassProfileDto, MedClassProfileStatDto, MedSchoolFactsRes } from '../../medschools.contract';
import { schoolFactsQuery } from '../../medschools.queries';
import { EnteringClass, EnteringClassView } from './EnteringClass';

const stat = (kind: string, value: string, over: Partial<MedClassProfileStatDto> = {}): MedClassProfileStatDto => ({
  kind,
  program: 'REG',
  value,
  num: null,
  qualifier: null,
  evidence: `${kind} ${value}`,
  ...over,
});
const newest: MedClassProfileDto = {
  label: 'Class of 2030',
  enteringYear: 2026,
  url: 'https://alpha.edu/class-profile',
  checkedOn: '2026-11-24',
  stats: [
    stat('APPLICANTS', '14,403', { evidence: 'Applicants 14,403 12,801' }),
    stat('MCAT_MEAN', '511', { evidence: 'Average MCAT 511 511', qualifier: 'labelled Average MCAT' }),
    stat('GPA_MEDIAN', '3.82', { evidence: 'Median GPA 3.82' }),
    stat('SGPA_MEAN', '3.79', { qualifier: 'five-year average' }),
    stat('MATRICULANTS', '193'),
    stat('IN_STATE_PCT', '38%'),
    stat('OTHER', '22%', { qualifier: 'first-generation college students', evidence: 'First generation 22%' }),
    stat('APPLICANTS', '562', { program: 'PHD', qualifier: 'M.D.-Ph.D. program', evidence: 'MD-PhD applicants 562' }),
  ],
};
const previous: MedClassProfileDto = {
  label: 'Class of 2029',
  enteringYear: 2025,
  url: 'https://alpha.edu/class-profile',
  checkedOn: '2026-11-24',
  stats: [stat('APPLICANTS', '12,801'), stat('MCAT_MEDIAN', '510')],
};
const undated: MedClassProfileDto = {
  label: 'M.D. Class Profile (Entering Class)',
  enteringYear: null,
  url: 'https://beta.edu/files/profile.pdf',
  checkedOn: '2026-11-24',
  stats: [stat('MCAT_RANGE', '511 - 527'), stat('GPA_RANGE', '3.65 - 4.0')],
};

const render = (classes: MedClassProfileDto[], degree: 'MD' | 'DO' = 'MD') =>
  renderToString(<EnteringClassView classes={classes} schoolName="Alpha" degree={degree} />);
const dts = (html: string) => [...html.matchAll(/<dt>([^<]*)<\/dt>/g)].map((x) => x[1]);

describe('EnteringClassView', () => {
  const html = render([newest, previous]);

  it('labels the newest class with its entering year, and shows exactly the stated figures as tiles, in order', () => {
    expect(html).toContain('Entering class');
    expect(html).toContain('Entered 2026');
    const firstClass = html.slice(0, html.indexOf('<details'));
    const tiles = [...firstClass.matchAll(/data-kind="([A-Z_0-9]+)"/g)].map((x) => x[1]);
    expect(tiles).toEqual([
      'MCAT_MEAN',
      'GPA_MEDIAN',
      'SGPA_MEAN',
      'APPLICANTS',
      'MATRICULANTS',
      'IN_STATE_PCT',
      'APPLICANTS',
    ]);
    expect(dts(firstClass)).toEqual([
      'Mean MCAT',
      'Median GPA',
      'Mean science GPA',
      'Applicants',
      'Class size',
      'In state',
      'First-generation college students',
      'Applicants',
    ]);
    for (const v of ['14,403', '511', '3.82', '3.79', '193', '38%', '22%', '562'])
      expect(firstClass).toContain(`>${v}<`);
    // A research note on the wording is not shown; the page's own scope is.
    expect(firstClass).not.toContain('labelled Average MCAT');
    expect(firstClass).toContain('five-year average');
  });

  it('computes nothing: no acceptance rate, ratio or reformatted number', () => {
    const text = html.replace(/<[^>]+>/g, ' ');
    expect(text).not.toMatch(/\bacceptance\b|\brate\b|\bratio\b|14403|1\.3%/i);
    expect(html).not.toContain('Median MCAT</dt><dd class="medapp-fig__value">511');
  });

  it('puts an MD-PhD-only figure in its own group, DO-PhD at a DO school', () => {
    expect(html).toContain('MD-PhD program');
    expect(render([newest], 'DO')).toContain('DO-PhD program');
    // The group's heading already says it: the qualifier is not repeated under the tile.
    expect(html).not.toContain('>M.D.-Ph.D. program<');
    expect(render([previous])).not.toContain('PhD program');
  });

  it('shows the previous class in a native disclosure with the same figures', () => {
    expect(html).toContain('<details class="medapp-disclosure medapp-profile__prev">');
    const prev = html.slice(html.indexOf('<details'));
    expect(prev).toContain('Previous class');
    expect(prev).toContain('Entered 2025');
    expect(dts(prev)).toEqual(['Median MCAT', 'Applicants']);
    expect(render([newest])).not.toContain('<details');
  });

  it('cites the class profile, deep-linked to the figures’ words, with the source line and its caveat', () => {
    expect(html).toContain('Source: Alpha’s class profile, checked November 24, 2026');
    expect(html).toContain('Figures as the school publishes them.');
    const hrefs = [...html.matchAll(/data-href="([^"]+)"/g)].map((x) => x[1]!.replace(/&amp;/g, '&'));
    expect(hrefs[0]).toMatch(/^https:\/\/alpha\.edu\/class-profile#:~:text=/);
    expect(hrefs[0]).toContain(`text=${encodeURIComponent('Applicants 14,403 12,801')}`);
    expect(hrefs[0]).toContain('&text=');
    // The OTHER row cites its own words.
    expect(hrefs).toContain(`https://alpha.edu/class-profile#:~:text=${encodeURIComponent('First generation 22%')}`);
  });

  it('labels an undated class with the page’s words and "Year not stated"; a PDF opens without a fragment', () => {
    const u = render([undated]);
    expect(u).toContain('M.D. Class Profile (Entering Class) · Year not stated');
    expect(dts(u)).toEqual(['MCAT range', 'GPA range']);
    expect(u).toContain('>511 - 527<');
    expect(u).toContain('data-href="https://beta.edu/files/profile.pdf"');
  });

  it('renders nothing without a class', () => {
    expect(render([])).toBe('');
  });

  it('uses the app tier: no site tokens and no shadow classes', () => {
    expect(html).not.toMatch(/--site-|shadow|surface-card/);
  });

  it('lays the tiles two to a row on a phone, in tabular figures, from tokens', () => {
    const css = readCss('features/medschools/ui/medschools/facts-tracker.css');
    const block = css.slice(css.indexOf('.medapp-figs {'));
    expect(block).toMatch(/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.medapp-fig__value \{[^}]*font-variant-numeric: tabular-nums/);
    expect(css.slice(css.indexOf('Facts: the entering class'))).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe('EnteringClass (the section)', () => {
  const data = (classes: MedClassProfileDto[]): MedSchoolFactsRes => ({
    pageUrl: MSAR_PAGE_URL,
    facts: [],
    mdphd: null,
    classes,
  });
  const section = (classes: MedClassProfileDto[]) => {
    const qc = new QueryClient();
    qc.setQueryData(schoolFactsQuery('alpha').queryKey, data(classes));
    return renderToString(
      <QueryClientProvider client={qc}>
        <EnteringClass slug="alpha" schoolName="Alpha" degree="MD" />
      </QueryClientProvider>,
    );
  };

  it('renders from the seeded public query, and no panel at all for a school without a profile', () => {
    expect(section([newest])).toContain('Entering class');
    expect(section([])).toBe('');
  });
});

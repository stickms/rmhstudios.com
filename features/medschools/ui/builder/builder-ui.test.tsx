import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k] ?? '')),
    i18n: { language: 'en-US' },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, search: _s, ...rest }: { to: string; params?: { slug: string }; search?: unknown; children: ReactNode }) => (
    <a href={params ? to.replace('$slug', params.slug) : to} {...rest}>
      {children}
    </a>
  ),
}));

import type { MedBuildRes, MedBuildSchoolDto } from '../../medschools.contract';
import { bodyOf, draftOf } from '../stats/draft';
import { BuildResult } from './BuildResult';
import { defaultListName } from './BuilderPage';

const school = (slug: string, label: MedBuildSchoolDto['label'], over: Partial<MedBuildSchoolDto> = {}): MedBuildSchoolDto => ({
  slug,
  name: `${slug} School of Medicine`,
  shortName: slug,
  state: 'NY',
  degree: 'MD',
  program: 'ANY',
  label,
  comparisons: [],
  figures: [],
  notes: [],
  reason: null,
  ...over,
});
const res = (schools: MedBuildSchoolDto[], over: Partial<MedBuildRes> = {}): MedBuildRes => ({
  status: 'built',
  usedStats: true,
  statsMissing: false,
  schools,
  member: [{ ref: 'm1', label: 'Your MCAT', text: 'Your most recent MCAT total (April 2026): 513' }],
  filters: { states: [], degree: null, mdphd: false, size: null, missions: [], unused: [], count: 15 },
  notice: null,
  tier: 'free',
  remainingToday: 3,
  dailyCap: 25,
  thinking: false,
  ...over,
});
const html = (r: MedBuildRes) =>
  renderToString(<BuildResult res={r} selected={new Set(r.schools.map((s) => s.slug))} onToggle={() => undefined} />);

describe('BuildResult', () => {
  it('groups by the code’s label, reach first, with the comparison, the reason and every figure’s source', () => {
    const out = html(
      res([
        school('likely1', 'likely'),
        school('reach1', 'reach', {
          comparisons: [{ metric: 'MCAT', yours: '513', theirs: '520', stat: 'median', band: 'below' }],
          reason: { text: 'Your MCAT of 513 is below the class median of 520.', cites: ['m1', 'c1f1'] },
          figures: [
            {
              ref: 'c1f1',
              kind: 'MCAT_MEDIAN',
              value: '520',
              classLabel: 'Entered 2026',
              enteringYear: 2026,
              sourceUrl: 'https://med.example.edu/profile',
              checkedOn: '2026-11-24',
              evidence: 'Median MCAT 520',
            },
          ],
        }),
        school('nodata', 'not-enough-data'),
      ]),
    );
    const at = (s: string) => out.indexOf(s);
    expect(at('Reach (1)')).toBeGreaterThan(-1);
    expect(at('Reach (1)')).toBeLessThan(at('Likely (1)'));
    expect(at('Likely (1)')).toBeLessThan(at('Not enough published data (1)'));
    expect(out).toContain('Your MCAT 513 vs the class’s median 520');
    expect(out).toContain('Median MCAT');
    expect(out).toContain('https://med.example.edu/profile#:~:text=');
    expect(out).toContain('[yours, 1]');
    expect(out).toContain('No published class figures');
    expect(out).toContain('Your figures used');
    expect(out.replace(/href="[^"]*"/g, '')).not.toMatch(/\d\s?%|chance of/i);
  });

  it('says what was not used and when no stats were there to compare', () => {
    const out = html(
      res([school('a', 'not-compared')], {
        statsMissing: true,
        usedStats: false,
        notice: 'removed-ungrounded',
        filters: { states: [], degree: null, mdphd: false, size: null, missions: ['rural'], unused: ['rural'], count: 15 },
      }),
    );
    expect(out).toContain('nothing was compared');
    expect(out).toContain('Some reasons were removed');
    expect(out).toContain('no public data on rural');
    expect(out).toContain('Schools (1)');
  });

  it('names a saved list from the request', () => {
    expect(defaultListName('  20 schools   in the Northeast ')).toBe('20 schools in the Northeast');
    expect(defaultListName('x'.repeat(80))).toHaveLength(58);
  });
});

describe('the stats draft', () => {
  it('round trips the stored stats and refuses what the server would', () => {
    const d = draftOf(null, 'TX');
    expect(d.homeState).toBe('TX');
    expect(bodyOf(d)).toEqual({
      body: expect.objectContaining({ mcat: [], hours: [], homeState: 'TX', publications: null }),
    });
    d.mcat.push({ month: '2026-04', day: '', total: '', cpbs: '128', cars: '127', bbls: '129', psbb: '128' });
    d.gpa.cumulative = '3.81';
    d.hours.RESEARCH = { hours: '1200', note: ' two labs ', activities: [{ title: 'Lab A', hours: '700', note: '' }] };
    const ok = bodyOf(d);
    expect('body' in ok && ok.body.mcat?.[0]?.total).toBe(512);
    expect('body' in ok && ok.body.hours).toEqual([
      { category: 'RESEARCH', hours: 1200, note: 'two labs', activities: [{ title: 'Lab A', hours: 700, note: null }] },
    ]);
    d.mcat[0]!.total = '513';
    d.gpa.science = '4.5';
    d.publications = 'many';
    expect(bodyOf(d)).toEqual({ problems: { 'mcat.0': 'sum', 'gpa.science': 'gpa', 'count.publications': 'number' } });
  });
});

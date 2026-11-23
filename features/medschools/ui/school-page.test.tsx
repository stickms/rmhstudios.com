import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ search: {} as Record<string, unknown> }));

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
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    className,
    id,
  }: {
    to: string;
    params?: { slug: string };
    children: ReactNode;
    className?: string;
    id?: string;
  }) => (
    <a href={params ? to.replace('$slug', params.slug) : to} className={className} id={id}>
      {children}
    </a>
  ),
  useNavigate: () => () => undefined,
  useSearch: () => h.search,
  useParams: () => ({ slug: 'duke' }),
}));
vi.mock('@/components/feed/PageLayout', () => ({
  PageLayout: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, children, ...rest }: { value: string; children: ReactNode; 'aria-label'?: string }) => (
    <select aria-label={rest['aria-label']} defaultValue={value}>
      {children}
    </select>
  ),
}));

import { SchoolPage } from './SchoolPage';
import { activityQuery, historyQuery, schoolQuery } from '../medschools.queries';
import type {
  ActivityTypeDto,
  MedChartedTypeId,
  MedSchoolDetailDto,
  MedSchoolActivityRes,
  MedSchoolHistoryRes,
} from '../medschools.contract';

const root = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

const detail = (o: Partial<MedSchoolDetailDto> = {}, degree: 'MD' | 'DO' = 'MD'): MedSchoolDetailDto => ({
  school: {
    slug: 'duke',
    name: 'Duke University School of Medicine',
    shortName: 'Duke',
    degree,
    city: 'Durham',
    state: 'NC',
    website: 'https://medschool.duke.edu/',
    interviewFormat: 'MMI',
    interviewType: null,
  },
  cycleYear: 2026,
  programsWithData: ['REG'],
  links: [{ source: 'ADMIT', name: 'Admit', href: 'https://example.org/admit/duke', scope: 'school', cycleYear: null }],
  stats: [],
  profiles: [],
  questions: [],
  ...o,
});

const TYPES: MedChartedTypeId[] = ['INTERVIEW', 'SECONDARY', 'WAITLIST', 'REJECTION', 'ACCEPTANCE'];
const days = [
  { date: '2026-11-18', count: 3 },
  { date: '2026-11-20', count: 4 },
];
const series = (source: 'CYCLETRACK' | 'ADMIT' | 'SDN') => ({ source, days, total: 7 });
const activity = (
  o: Partial<MedSchoolActivityRes> = {},
  perType: (t: MedChartedTypeId) => ActivityTypeDto = (t) => ({
    eventType: t,
    primary: t === 'INTERVIEW' ? 'CYCLETRACK' : null,
    sources: t === 'INTERVIEW' ? [series('CYCLETRACK'), series('ADMIT')] : [],
  }),
): MedSchoolActivityRes => ({
  cycleYear: 2026,
  program: 'ALL',
  dayZeroOn: '2026-06-01',
  dayZeroEstimated: false,
  types: TYPES.map(perType),
  otherTotals: [],
  unreportedProgram: 0,
  unreportedProgramSource: null,
  ...o,
});

function render(seed: (qc: QueryClient) => void): string {
  const qc = new QueryClient();
  seed(qc);
  return renderToString(
    <QueryClientProvider client={qc}>
      <SchoolPage />
    </QueryClientProvider>,
  );
}
const seedActivity =
  (act: MedSchoolActivityRes, d = detail(), program: 'ALL' | 'REG' | 'PHD' = 'ALL') =>
  (qc: QueryClient) => {
    qc.setQueryData(schoolQuery('duke').queryKey, d);
    qc.setQueryData(activityQuery('duke', { program, cycle: undefined }).queryKey, act);
  };

describe('route file', () => {
  const src = root('../../../app/routes/_site/rmh-medschool/$slug.tsx');
  it('is thin: validateSearch, strip defaults, notFound through the loader, card and breadcrumbs, no charts', () => {
    expect(src).toContain("createFileRoute('/_site/rmh-medschool/$slug')");
    expect(src).toContain('validateSearch: validateSchoolSearch');
    expect(src).toContain('stripSearchParams(SCHOOL_SEARCH_DEFAULTS)');
    expect(src).toContain('definePage');
    expect(src).toContain('ogCard');
    expect(src).toContain('breadcrumbSchema');
    expect(src).toContain('loadSchoolHead');
    expect(src).not.toMatch(/ui\/charts|chart-geometry|d3-/);
    expect(root('../medschools.queries.ts')).toContain('throw notFound()');
  });
  it('SchoolPage uses the shared tab strip in link mode, with no hand-rolled strip', () => {
    const page = root('./SchoolPage.tsx');
    expect(page).toContain('PageTabs');
    expect(page).toContain('renderTab');
    expect(page).not.toMatch(/aria-selected|layoutId/);
    expect(page).not.toMatch(/forecast/i);
  });
  it('SchoolLink is gone: links are typed', () => {
    expect(() => root('./SchoolLink.tsx')).toThrow();
    expect(root('./IndexPage.tsx')).toContain('to="/rmh-medschool/$slug"');
  });
});

describe('SchoolPage', () => {
  it('renders exactly the three tabs and no Forecast', () => {
    h.search = {};
    const html = render(seedActivity(activity()));
    expect(html).toContain('>Activity<');
    expect(html).toContain('>History<');
    expect(html).toContain('>Interviews<');
    expect(html).not.toContain('Forecast');
    expect(html).toContain('<h1>Duke University School of Medicine</h1>');
    expect(html).toContain('MD · Durham, NC');
  });

  it('Activity server-renders svg paths, names the primary and the comparison, and attributes sources', () => {
    h.search = {};
    const html = render(seedActivity(activity()));
    expect(html).toContain('<svg');
    expect(html).toContain('<path');
    expect(html).toContain('Reported events');
    expect(html).toContain('CycleTrack (primary)');
    expect(html).toContain('Admit.org');
    expect(html).toContain('Source: Admit.org');
  });

  it('Activity totals are one compact matrix: a row per category, a column per source, the primary marked', () => {
    h.search = {};
    const html = render(
      seedActivity(
        activity({}, (t) => ({
          eventType: t,
          primary: t === 'INTERVIEW' ? 'CYCLETRACK' : t === 'SECONDARY' ? 'ADMIT' : null,
          sources:
            t === 'INTERVIEW' ? [series('CYCLETRACK'), series('SDN')] : t === 'SECONDARY' ? [series('ADMIT')] : [],
        })),
      ),
    );
    const table = html.slice(html.indexOf('Totals this cycle'));
    expect(table.match(/<tr>/g)).toHaveLength(3); // head + two categories with data
    expect(table).toContain('>CycleTrack<');
    expect(table).toContain('>Admit<');
    expect(table).toContain('>SDN<');
    expect(table).not.toContain('Student Doctor Network</th>');
    expect(table).toContain('font-semibold');
    expect(table).toContain('(primary)');
  });

  it('the school header carries the crest (decorative) beside the place line, and the name is the only title', () => {
    h.search = {};
    const html = render(seedActivity(activity()));
    expect(html).toContain('size-10');
    expect(html).toMatch(/<img[^>]+alt=""/);
    expect(html.match(/<h1>/g)).toHaveLength(1);
  });

  it('History puts the program, category and source selects in one controls row', () => {
    h.search = { tab: 'history' };
    const pts = [{ day: 10, cumulative: 3 }];
    const hist: MedSchoolHistoryRes = {
      program: 'ALL',
      eventType: 'INTERVIEW',
      cycles: [
        {
          cycleYear: 2026,
          dayZeroOn: '2025-06-01',
          dayZeroEstimated: false,
          sources: [
            { source: 'CYCLETRACK', points: pts, total: 3 },
            { source: 'ADMIT', points: pts, total: 3 },
          ],
        },
        {
          cycleYear: 2025,
          dayZeroOn: '2024-06-01',
          dayZeroEstimated: false,
          sources: [{ source: 'CYCLETRACK', points: pts, total: 3 }],
        },
      ],
    };
    const html = render((qc) => {
      qc.setQueryData(schoolQuery('duke').queryKey, detail());
      qc.setQueryData(historyQuery('duke', { program: 'ALL', type: 'INTERVIEW' }).queryKey, hist);
    });
    const row = html.slice(html.indexOf('flex flex-wrap gap-x-6 gap-y-3'));
    const head = row.slice(0, row.indexOf('<figure'));
    // The program toggles (a group), then the category and source single-select groups (O7).
    expect(head).toContain('aria-label="Programs"');
    for (const label of ['Category', 'Source']) expect(head).toContain(`role="radiogroup" aria-label="${label}"`);
    expect(head).not.toContain('<select');
    expect(html).not.toMatch(/days since/i);
    expect(html).toContain('>Jun 1<');
    expect(html).toContain('2025\u20132026');
  });

  it('Activity toggles are the first thing, a labelled group, and `show` limits the drawn categories', () => {
    h.search = { show: 'interview,acceptance' };
    const html = render(seedActivity(activity()));
    expect(html.indexOf('role="group"')).toBeGreaterThan(-1);
    expect(html.indexOf('role="group"')).toBeLessThan(html.indexOf('<svg'));
    const cats = html.slice(html.indexOf('aria-label="Show categories"'));
    // The toggles are the legend: inside the chart card, above the drawing.
    expect(html.indexOf('<figure')).toBeLessThan(html.indexOf('aria-label="Show categories"'));
    expect(cats.slice(0, cats.indexOf('<svg viewBox')).match(/aria-pressed="true"/g)).toHaveLength(2);
  });

  it('Activity with only Admit data names Admit primary and never CycleTrack', () => {
    h.search = {};
    const html = render(
      seedActivity(
        activity({}, (t) => ({
          eventType: t,
          primary: t === 'INTERVIEW' ? 'ADMIT' : null,
          sources: t === 'INTERVIEW' ? [series('ADMIT')] : [],
        })),
      ),
    );
    expect(html).toContain('Admit.org (primary)');
    expect(html).not.toContain('CycleTrack');
  });

  it('Activity with no types of data renders the empty state and no chart', () => {
    h.search = {};
    const html = render(seedActivity(activity({}, (t) => ({ eventType: t, primary: null, sources: [] }))));
    expect(html).toContain('No reported events yet this cycle.');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('NaN');
  });

  it('an empty PHD program shows the empty state and none of the REG numbers', () => {
    h.search = { program: 'PHD' };
    const html = render(
      seedActivity(
        activity({ program: 'PHD' }, (t) => ({ eventType: t, primary: null, sources: [] })),
        detail(),
        'PHD',
      ),
    );
    expect(html).toContain('No reported events yet this cycle.');
    expect(html).not.toMatch(/>7</);
  });

  it('prints the cycle in the Activity heading and totals withdrawn and hold without charting them', () => {
    h.search = {};
    const html = render(
      seedActivity(activity({ otherTotals: [{ eventType: 'HOLD', sources: [{ source: 'ADMIT', total: 4 }] }] })),
    );
    expect(html).toContain('2025\u20132026 cycle');
    expect(html).toContain('>Hold<');
  });

  it('unreported program events appear as one muted line and in no chart or table cell', () => {
    h.search = {};
    const html = render(seedActivity(activity({ unreportedProgram: 9, unreportedProgramSource: 'ADMIT' })));
    expect(html).toContain('9 reported events from Admit.org did not say a program');
    expect(html.match(/>9</g)).toBeNull();
  });

  it('the program control on a DO school is two toggles, DO and DO-PhD, never MD (O5, O7)', () => {
    h.search = {};
    const html = render(seedActivity(activity(), detail({}, 'DO')));
    const group = html.slice(
      html.indexOf('aria-label="Programs"'),
      html.indexOf('</div>', html.indexOf('aria-label="Programs"')),
    );
    expect(group.match(/<button/g)).toHaveLength(2);
    expect(group).toContain('>DO</span>');
    expect(group).toContain('>DO-PhD</span>');
    expect(group).not.toContain('MD');
    // The default program is All: both toggles are on.
    expect(group.match(/aria-pressed="true"/g)).toHaveLength(2);
  });

  it('History draws one source: never a cross-source line', () => {
    h.search = { tab: 'history' };
    const pts = [
      { day: 10, cumulative: 3 },
      { day: 20, cumulative: 7 },
    ];
    const hist: MedSchoolHistoryRes = {
      program: 'ALL',
      eventType: 'INTERVIEW',
      cycles: [
        {
          cycleYear: 2026,
          dayZeroOn: '2025-06-01',
          dayZeroEstimated: false,
          sources: [
            { source: 'CYCLETRACK', points: pts, total: 7 },
            { source: 'ADMIT', points: pts, total: 7 },
          ],
        },
        {
          cycleYear: 2025,
          dayZeroOn: '2024-06-01',
          dayZeroEstimated: true,
          sources: [{ source: 'CYCLETRACK', points: pts, total: 7 }],
        },
      ],
    };
    const html = render((qc) => {
      qc.setQueryData(schoolQuery('duke').queryKey, detail());
      qc.setQueryData(historyQuery('duke', { program: 'ALL', type: 'INTERVIEW' }).queryKey, hist);
    });
    expect(html).toContain('Sources: CycleTrack (primary)');
    expect(html).not.toContain('Admit.org (primary)');
    expect(html).toContain('2025: cycle start estimated as June 1.');
    // Two cycles, drawn once per width (phone, mid, wide).
    expect(html.match(/<path/g)).toHaveLength(2 * 3);
  });

  const profile = {
    source: 'SDN' as const,
    format: 'MMI',
    fileType: null,
    avgDifficulty: 3,
    avgStress: null,
    avgImpression: null,
    interviewCount: 40,
    interviewStyle: null,
    interviewLength: null,
    feedbackPositive: [],
    feedbackNegative: [],
    feedbackBefore: [],
  };
  const stat = {
    source: 'ADMIT' as const,
    program: null,
    cycleYear: 2026,
    residence: 'GLOBAL' as const,
    allCycles: true,
    gpaMedian: 3.9,
    gpaLow: 3.7,
    gpaHigh: 4,
    mcatMedian: 520,
    mcatLow: null,
    mcatHigh: null,
    interviewToAcceptancePct: null,
    applicationToInterviewPct: null,
    applicationCount: null,
    interviewCount: null,
    admittedCount: null,
    researchHours: null,
    clinicalHours: null,
    nonClinicalHours: null,
  };
  const EMPTY = 'No interview data has been collected for this school yet.';

  it('Interviews has three sub-tabs in a radio group, Overview first, and no School info tab', () => {
    h.search = { tab: 'interviews' };
    const html = render((qc) => qc.setQueryData(schoolQuery('duke').queryKey, detail()));
    expect(html).toContain('aria-label="Interview sections"');
    expect(html).toContain('>Overview<');
    expect(html).toContain('>Questions<');
    expect(html).toContain('>Format and feedback<');
    expect(html).not.toContain('School info');
  });

  it('Format and feedback shows the split only when present', () => {
    h.search = { tab: 'interviews', itab: 'format' };
    const without = render((qc) =>
      qc.setQueryData(schoolQuery('duke').queryKey, detail({ profiles: [{ ...profile, split: null }] })),
    );
    expect(without).not.toMatch(/In-state/);
    const withSplit = render((qc) =>
      qc.setQueryData(
        schoolQuery('duke').queryKey,
        detail({ profiles: [{ ...profile, split: { inState: 12, outOfState: 28 } }] }),
      ),
    );
    expect(withSplit).toContain('In-state');
    expect(withSplit).toContain('>12<');
    expect(withSplit).toContain('>28<');
  });

  it('Overview labels Admit all-cycles stats and compares reported invites with the yearly figure', () => {
    h.search = { tab: 'interviews' };
    const html = render((qc) => {
      qc.setQueryData(schoolQuery('duke').queryKey, detail({ stats: [{ ...stat, interviewCount: 200 }] }));
      qc.setQueryData(activityQuery('duke', { program: 'ALL', cycle: undefined }).queryKey, activity());
    });
    expect(html).toContain('Admit.org, all reported cycles');
    expect(html).toContain('GPA median');
    expect(html).toContain('7 reported interview invites this cycle');
    expect(html).toContain('About 200 interviews a year');
    expect(html).toContain('Source: Admit.org');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemax="200"');
    expect(html).toContain('width:4%'.replace('width', 'inline-size'));
  });

  it('Overview hides the comparison when the yearly figure is unknown', () => {
    h.search = { tab: 'interviews' };
    const html = render((qc) => {
      qc.setQueryData(schoolQuery('duke').queryKey, detail({ stats: [stat] }));
      qc.setQueryData(activityQuery('duke', { program: 'ALL', cycle: undefined }).queryKey, activity());
    });
    expect(html).toContain('7 reported interview invites this cycle');
    expect(html).not.toContain('interviews a year');
    expect(html).not.toContain('role="progressbar"');
  });

  it('each sub-tab says plainly when there is nothing', () => {
    for (const itab of ['overview', 'questions', 'format'] as const) {
      h.search = { tab: 'interviews', itab };
      const html = render((qc) => qc.setQueryData(schoolQuery('duke').queryKey, detail()));
      expect(html, itab).toContain(EMPTY);
    }
  });

  it('Questions are searchable and show votes and cycle', () => {
    h.search = { tab: 'interviews', itab: 'questions' };
    const html = render((qc) =>
      qc.setQueryData(
        schoolQuery('duke').queryKey,
        detail({ questions: [{ text: 'Why medicine?', source: 'ADMIT', votes: 5, cycleYear: 2026 }] }),
      ),
    );
    expect(html).toContain('type="search"');
    expect(html).toContain('Why medicine?');
    expect(html).toContain('5 votes');
  });

  it('History carries the When results arrive section, under the overlay and hidden without enough events', () => {
    const src = root('./HistoryTab.tsx');
    expect(src).toContain('ArrivalsSection');
    expect(root('./ArrivalsSection.tsx')).toContain('enoughArrivals');
  });
});

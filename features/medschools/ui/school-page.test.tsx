import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  session: null as null | { user: { id: string } },
}));

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
vi.mock('@/components/session/session-context', () => ({
  useSession: () => ({ data: h.session, isPending: false }),
}));
vi.mock('./SaveToList', () => ({ SaveToList: () => null }));
vi.mock('@/components/errors/useRefusalText', () => ({
  useRefusalText: () => Object.assign((e: unknown) => String(e), { maybe: (e: unknown) => String(e) }),
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
import { activityQuery, chancesQuery, forecastQuery, historyQuery, schoolQuery } from '../medschools.queries';
import type {
  ActivityTypeDto,
  MedChartedTypeId,
  MedSchoolDetailDto,
  MedSchoolActivityRes,
  MedSchoolForecastRes,
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
  waves: [],
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
  });
  it('SchoolLink is gone: links are typed', () => {
    expect(() => root('./SchoolLink.tsx')).toThrow();
    expect(root('./IndexPage.tsx')).toContain('to="/rmh-medschool/$slug"');
  });
});

describe('SchoolPage', () => {
  it('renders the four tabs in order, Forecast between History and Interviews', () => {
    h.search = {};
    const html = render(seedActivity(activity()));
    expect(html).toContain('>Activity<');
    expect(html).toContain('>History<');
    expect(html).toContain('>Interviews<');
    expect(html).toContain('>Forecast<');
    expect(html.indexOf('>History<')).toBeLessThan(html.indexOf('>Forecast<'));
    expect(html.indexOf('>Forecast<')).toBeLessThan(html.indexOf('>Interviews<'));
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
    expect(html).toContain('\u20662025\u20132026\u2069 cycle'); // the years sit in an LTR isolate so ar does not reverse them
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

describe('Activity waves', () => {
  it('the page names the waves in one line and marks them on both charts', () => {
    h.search = {};
    const html = render(seedActivity(activity({ waves: [{ date: '2026-11-18', count: 12, baseline: 2 }] })));
    expect(html).toContain('Waves: Nov 18 (12 invites)');
    expect(html.match(/data-wave/g)!.length).toBeGreaterThanOrEqual(2);
  });
  it('no waves: no line, no tick, no legend entry', () => {
    h.search = {};
    const html = render(seedActivity(activity()));
    expect(html).not.toContain('Waves:');
    expect(html).not.toContain('data-wave');
    expect(html).not.toContain('>Wave<');
  });
});

describe('Forecast tab', () => {
  const forecast = (o: Partial<MedSchoolForecastRes> = {}): MedSchoolForecastRes => ({
    program: 'REG',
    eventType: 'INTERVIEW',
    cycleYear: 2026,
    dayZeroOn: '2025-06-01',
    dayZeroEstimated: false,
    endOn: '2026-05-31',
    status: 'ready',
    source: 'ADMIT',
    asOf: '2025-11-20',
    observed: [
      { day: 170, cumulative: 4 },
      { day: 172, cumulative: 10 },
    ],
    band: [
      { day: 172, p10: 10, p50: 10, p90: 10 },
      { day: 200, p10: 14, p50: 20, p90: 28 },
      { day: 364, p10: 20, p50: 30, p90: 44 },
    ],
    summary: {
      total: { p10: 20, p50: 30, p90: 44 },
      halfOn: { p10: '2025-12-20', p50: '2026-01-10', p90: '2026-02-02' },
    },
    basis: [
      { cycleYear: 2025, source: 'ADMIT', weight: 0.6 },
      { cycleYear: 2024, source: 'ADMIT', weight: 0.4 },
    ],
    ...o,
  });
  const seed =
    (f: MedSchoolForecastRes, program: 'REG' | 'PHD' = 'REG', type: MedChartedTypeId = 'INTERVIEW') =>
    (qc: QueryClient) => {
      qc.setQueryData(schoolQuery('duke').queryKey, detail());
      qc.setQueryData(forecastQuery('duke', { program, type }).queryKey, f);
    };

  it('a ready forecast server-renders the chart and the summary rows, with calendar dates and no day count', () => {
    h.search = { tab: 'forecast' };
    h.session = null;
    const html = render(seed(forecast()));
    expect(html).toContain('<svg');
    expect(html).toContain('Interview invite: expected total 30, likely between 20 and 44');
    expect(html).toContain('Half of them by Jan 10, likely between Dec 20 and Feb 2');
    expect(html).toContain('Forecast as of Nov 20.');
    expect(html).toContain('Based on 2 earlier cycles from Admit.');
    expect(html).not.toMatch(/days since|day \d/i);
    expect(html).not.toContain('NaN');
  });

  it('early says the range is wide; one earlier cycle says the range is narrower than the real uncertainty', () => {
    h.search = { tab: 'forecast' };
    const early = render(seed(forecast({ status: 'early' })));
    expect(early).toContain('Early in the cycle, so the range is wide');
    const one = render(seed(forecast({ basis: [{ cycleYear: 2025, source: 'ADMIT', weight: 1 }] })));
    expect(one).toContain('Based on one earlier cycle from Admit.');
    expect(one).toContain('narrower than the real uncertainty');
  });

  it('no-history draws the observed line and says earlier cycles are too thin; no summary', () => {
    h.search = { tab: 'forecast' };
    const html = render(seed(forecast({ status: 'no-history', band: [], summary: null, basis: [] })));
    expect(html).toContain('<svg');
    expect(html).toContain('Earlier cycles do not have enough reported events for a forecast.');
    expect(html).not.toContain('Expected total');
  });

  it('pending says the forecast is computed once a day; no-data is the empty state and no chart', () => {
    h.search = { tab: 'forecast' };
    const pending = render(seed(forecast({ status: 'pending', asOf: null, band: [], summary: null, basis: [] })));
    expect(pending).toContain('The forecast is computed once a day.');
    const none = render(
      seed(forecast({ status: 'no-data', observed: [], band: [], summary: null, basis: [], asOf: null })),
    );
    expect(none).toContain('No reported events yet this cycle.');
    expect(none).not.toContain('<svg viewBox');
  });

  it('All programs reads REG and says so in one line', () => {
    h.search = { tab: 'forecast', program: 'ALL' };
    const html = render(seed(forecast()));
    expect(html).toContain('A forecast is made for one program at a time. Showing MD.');
    h.search = { tab: 'forecast', program: 'REG' };
    expect(render(seed(forecast()))).not.toContain('one program at a time');
  });

  it('signed out asks for no chances and renders none; signed in with an application shows the rows', () => {
    h.search = { tab: 'forecast' };
    h.session = null;
    expect(render(seed(forecast()))).not.toContain('Your estimate');
    h.session = { user: { id: 'u1' } };
    const html = render((qc) => {
      seed(forecast())(qc);
      // The cycle is the one the Forecast tab shows (forecast().cycleYear), not whichever tracker cycle is newest.
      qc.setQueryData(chancesQuery({ school: 'duke', cycle: 2026 }).queryKey, {
        cycleYear: 2026,
        chances: [
          {
            applicationId: 'a1',
            school: { slug: 'duke', shortName: 'Duke', name: 'Duke', active: true },
            program: 'REG',
            status: 'estimate',
            completeOn: '2026-10-31',
            invitedOn: null,
            asOf: '2026-11-19',
            basis: 20,
            points: [{ on: '2026-11-27', percent: 29 }],
          },
        ],
      });
    });
    expect(html).toContain('Your estimate');
    expect(html).toContain('the chance of an interview invite:');
    expect(html).toContain('by \u2068Nov 27\u2069 \u00b7 \u206829%\u2069');
    // An answer cached under the cycle-less key (the newest tracker cycle) is not this page's estimate.
    const wrongCycle = render((qc) => {
      seed(forecast())(qc);
      qc.setQueryData(chancesQuery({ school: 'duke' }).queryKey, {
        cycleYear: 2027,
        chances: [
          {
            applicationId: 'a9',
            school: { slug: 'duke', shortName: 'Duke', name: 'Duke', active: true },
            program: 'REG',
            status: 'thin',
            completeOn: null,
            invitedOn: null,
            asOf: null,
            basis: null,
            points: [],
          },
        ],
      });
    });
    expect(wrongCycle).not.toContain('Your estimate');
    h.session = null;
  });

  it('the Forecast panel never imports the stats engine', () => {
    for (const f of ['./ForecastTab.tsx', './charts/ForecastBand.tsx', './SchoolChances.tsx']) {
      expect(root(f)).not.toMatch(/engine\/stats/);
    }
  });
});

describe('the Ask panel on a school page', () => {
  it('signed in: after the tab content and the links, pinned to the school, with the only ink primary', () => {
    h.search = {};
    h.session = { user: { id: 'u1' } };
    const html = render(seedActivity(activity()));
    expect(html).toContain('Ask about Duke University School of Medicine');
    expect(html.indexOf('Ask about Duke')).toBeGreaterThan(html.indexOf('href="/rmh-medschool/tracker"'));
    expect(html.indexOf('Ask about Duke')).toBeGreaterThan(html.indexOf('>Activity<'));
    expect(html).toContain('href="/rmh-medschool/ask"');
    expect(html.match(/data-variant="primary"/g)?.length ?? 0).toBe(1);
    // Three suggestions when pinned (the school page has no other plain buttons of this kind).
    expect(html).toContain('What are the MCAT and GPA medians?');
    expect(html).not.toContain('Compare reported interviews at Duke and Emory.');
    h.session = null;
  });

  it('signed out: no panel, no field, the page renders as before', () => {
    h.search = {};
    h.session = null;
    const html = render(seedActivity(activity()));
    expect(html).not.toContain('Ask about');
    expect(html).not.toContain('<textarea');
    expect(html).toContain('<h1>Duke University School of Medicine</h1>');
  });

  it('SchoolPage pins the slug it was given', () => {
    expect(root('./SchoolPage.tsx')).toMatch(/<AskPanel slug=\{slug\}/);
  });
});

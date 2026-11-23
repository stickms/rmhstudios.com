import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ search: {} as Record<string, unknown> }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      (o.count === 1 && typeof o.defaultValue_one === 'string' ? o.defaultValue_one : o.defaultValue).replace(
        /\{\{(\w+)\}\}/g,
        (_m, k: string) => String(o[k] ?? ''),
      ),
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, ...rest }: { to: string; params?: { slug: string }; children: ReactNode }) => (
    <a href={params ? to.replace('$slug', params.slug) : to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => () => undefined,
  useSearch: () => h.search,
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

import { IndexPage } from './IndexPage';
import { LivePage } from './LivePage';
import { liveQuery, resolveLiveFilters, schoolsQuery, todayQuery } from '../medschools.queries';
import type { LiveEventDto, MedSchoolListItemDto } from '../medschools.contract';

const root = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const squash = (s: string) => s.replace(/\s+/g, '').replace(/,\)/g, ')').replace(/,}/g, '}');

const school = (slug: string, o: Partial<MedSchoolListItemDto> = {}): MedSchoolListItemDto => ({
  slug,
  name: `${slug} University School of Medicine`,
  shortName: slug,
  degree: 'MD',
  city: 'Durham',
  state: 'NC',
  reported: { source: 'CYCLETRACK', count: 120 },
  ...o,
});

function withClient(seed: (qc: QueryClient) => void, node: ReactNode): string {
  const qc = new QueryClient();
  seed(qc);
  return renderToString(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

const seedIndex =
  (schools: MedSchoolListItemDto[], today: { date: string | null; isToday: boolean }) => (qc: QueryClient) => {
    qc.setQueryData(schoolsQuery({ program: 'ALL' }).queryKey, {
      cycleYear: 2026,
      program: 'ALL',
      schools,
      states: ['NC'],
    });
    qc.setQueryData(todayQuery('ALL').queryKey, {
      ...today,
      program: 'ALL',
      schools: [
        { slug: 'duke', shortName: 'Duke', name: 'Duke', city: 'Durham', state: 'NC', count: 4, source: 'ADMIT' },
      ],
    });
  };

describe('IndexPage', () => {
  h.search = { program: 'ALL' };
  it('lists schools as links with a count and the source name, and has no primary button', () => {
    const html = withClient(
      seedIndex([school('duke'), school('unc')], { date: '2026-11-20', isToday: true }),
      <IndexPage />,
    );
    expect(html).toContain('href="/rmh-medschool/duke"');
    expect(html).toContain('href="/rmh-medschool/unc"');
    expect(html).toContain('120 reported invites, CycleTrack');
    expect(html).toContain('4 invites · Admit.org');
    expect(html).toContain('>Durham, NC<');
    expect(html).not.toContain('data-variant="primary"');
  });
  it('pluralises and groups the reported count', () => {
    const html = withClient(
      seedIndex(
        [
          school('one', { reported: { source: 'ADMIT', count: 1 } }),
          school('many', { reported: { source: 'ADMIT', count: 1200 } }),
        ],
        { date: null, isToday: false },
      ),
      <IndexPage />,
    );
    expect(html).toContain('1 reported invite, Admit.org');
    expect(html).toContain('1,200 reported invites, Admit.org');
  });
  it('prints nothing in the figure slot of a school with no data', () => {
    const html = withClient(
      seedIndex([school('duke'), school('quiet', { reported: null })], { date: null, isToday: false }),
      <IndexPage />,
    );
    expect(html).toContain('href="/rmh-medschool/quiet"');
    expect(html).not.toContain('No reported invites');
    expect(html.match(/reported invites/g)).toHaveLength(1);
  });
  it('shows the empty state for no schools', () => {
    const html = withClient(seedIndex([], { date: null, isToday: false }), <IndexPage />);
    expect(html).not.toContain('/rmh-medschool/duke');
    expect(html).toContain('data-slot="empty-state"');
  });
  it('headlines the latest day with "today" only when it is today', () => {
    const today = withClient(seedIndex([school('duke')], { date: '2026-11-20', isToday: true }), <IndexPage />);
    expect(today).toContain('Interview invites reported today');
    const past = withClient(seedIndex([school('duke')], { date: '2026-11-20', isToday: false }), <IndexPage />);
    expect(past).toContain('Interview invites reported on Nov 20');
    expect(past).not.toContain('reported today');
  });
});

const ev = (id: string, o: Partial<LiveEventDto> = {}): LiveEventDto => ({
  id,
  eventType: 'INTERVIEW',
  program: 'REG',
  school: {
    slug: 'duke',
    shortName: 'Duke',
    name: 'Duke University School of Medicine',
    degree: 'MD',
    city: 'Durham',
    state: 'NC',
  },
  occurredAt: '2026-11-20T15:04:00.000Z',
  source: 'ADMIT',
  ...o,
});

describe('LivePage', () => {
  const seedLive =
    (events: LiveEventDto[], schools: MedSchoolListItemDto[] = [school('duke')]) =>
    (qc: QueryClient) => {
      qc.setQueryData(schoolsQuery({}).queryKey, { cycleYear: 2026, program: 'ALL', schools, states: [] });
      qc.setQueryData(liveQuery({ program: 'ALL' }).queryKey, {
        events,
        nextCursor: null,
        asOf: '2026-11-20T15:05:00.000Z',
      });
    };
  it('renders each row and no identifier', () => {
    h.search = { program: 'ALL' };
    const html = withClient(
      seedLive([ev('cabc123'), ev('cdef456', { program: null, eventType: 'WITHDRAWN', source: 'SDN' })]),
      <LivePage />,
    );
    expect(html).toContain('Interview invite');
    expect(html).toContain('Withdrawn');
    expect(html).toContain('href="/rmh-medschool/duke"');
    expect(html).toContain('Program not reported');
    expect(html).toContain('MD · Durham, NC');
    expect(html).toContain('Admit.org');
    expect(html).toContain('Student Doctor Network');
    expect(html).not.toMatch(/@|\/u\/|cabc123|cdef456/);
  });
  it('shows only the UTC day for an SDN event stored at midnight, and a relative time otherwise', () => {
    h.search = { program: 'ALL' };
    const html = withClient(
      seedLive([
        ev('d1', { source: 'SDN', occurredAt: '2026-11-18T00:00:00.000Z' }),
        ev('d2', { source: 'SDN', occurredAt: '2026-11-18T09:30:00.000Z' }),
        ev('d3', { source: 'ADMIT', occurredAt: '2026-11-19T00:00:00.000Z' }),
      ]),
      <LivePage />,
    );
    expect(html).toContain('>Nov 18<');
    expect(html.match(/<time dateTime="2026-11-18"/g)).toHaveLength(1);
    expect(html).toContain('<time dateTime="2026-11-19T00:00:00.000Z"'); // Admit keeps its exact time
  });
  it('when filtered to an MD school offers MD options only, whatever degree the URL says', () => {
    h.search = { program: 'ALL', school: 'duke', degree: 'DO' };
    const html = withClient(
      (qc) => {
        qc.setQueryData(schoolsQuery({}).queryKey, {
          cycleYear: 2026,
          program: 'ALL',
          schools: [school('duke')],
          states: [],
        });
        qc.setQueryData(liveQuery({ school: 'duke', program: 'ALL' }).queryKey, {
          events: [ev('x1')],
          nextCursor: null,
          asOf: 'now',
        });
      },
      <LivePage />,
    );
    expect(html).toContain('>MD</option>');
    expect(html).toContain('>MD-PhD</option>');
    expect(html).not.toContain('>DO</option>');
    expect(html).not.toContain('>DO-PhD</option>');
  });
  it('resolveLiveFilters resets a program whose degree was dropped (or never given) to All', () => {
    expect(resolveLiveFilters({ program: 'PHD', school: 'duke', degree: 'DO' }, 'MD')).toMatchObject({
      program: 'ALL',
    });
    expect(resolveLiveFilters({ program: 'PHD', school: 'duke', degree: 'MD' }, 'MD')).toMatchObject({
      program: 'PHD',
    });
    expect(resolveLiveFilters({ program: 'REG' }, undefined).program).toBe('ALL');
    expect(resolveLiveFilters({ program: 'NONE' }, undefined).program).toBe('NONE');
  });
  it('resolveLiveFilters drops a degree that contradicts the school', () => {
    expect(resolveLiveFilters({ program: 'ALL', school: 'duke', degree: 'DO' }, 'MD').degree).toBeUndefined();
    expect(resolveLiveFilters({ program: 'ALL', school: 'duke', degree: 'MD' }, 'MD').degree).toBe('MD');
    expect(resolveLiveFilters({ program: 'ALL', degree: 'DO' }, undefined).degree).toBe('DO');
  });
  it('uses mergeLiveHead and refetches every 60 s', () => {
    const src = root('./LivePage.tsx');
    expect(src).toContain('mergeLiveHead');
    expect(squash(src)).toContain('refetchInterval:60_000');
    expect(squash(src)).toContain('refetchIntervalInBackground:false');
    // A gap between the fetched head and the old rows drops the older pages.
    expect(src).toContain('merged.gap');
  });
});

describe('route files', () => {
  for (const [file, path, parser, component] of [
    ['index', '/_site/rmh-medschool/', 'parseIndexSearch', 'IndexPage'],
    ['live', '/_site/rmh-medschool/live', 'parseLiveSearch', 'LivePage'],
  ] as const) {
    it(`${file}.tsx is a thin route`, () => {
      const src = squash(root(`../../../app/routes/_site/rmh-medschool/${file}.tsx`));
      expect(src).toContain(`createFileRoute('${path}')`);
      expect(src).toContain('head:definePage(');
      expect(src).toContain(`validateSearch:${parser}`);
      expect(src).toContain('loaderDeps:');
      // Task 9 (D14): no strip middleware, so `?program=ALL` survives as "I chose All" against a preference.
      expect(src).not.toContain('stripSearchParams(');
      expect(src).toContain('loader:');
      expect(src).toContain('prefetch');
      expect(src).toContain(`component:${component}`);
    });
  }
});

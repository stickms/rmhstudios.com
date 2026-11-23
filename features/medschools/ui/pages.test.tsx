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
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      (o.count === 1 && typeof o.defaultValue_one === 'string' ? o.defaultValue_one : o.defaultValue).replace(
        /\{\{(\w+)\}\}/g,
        (_m, k: string) => String(o[k] ?? ''),
      ),
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    hash,
    children,
    ...rest
  }: {
    to: string;
    params?: { slug: string };
    hash?: string;
    children: ReactNode;
  }) => (
    <a href={(params ? to.replace('$slug', params.slug) : to) + (hash ? `#${hash}` : '')} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => () => undefined,
  useSearch: () => h.search,
}));
vi.mock('@/components/session/session-context', () => ({
  useSession: () => ({ data: h.session, isPending: false }),
}));
vi.mock('@/components/ui/prompt-dialog', () => ({ usePrompt: () => () => Promise.resolve(null) }));
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

import { IndexPage } from './IndexPage';
import { LivePage } from './LivePage';
import { liveQuery, listsQuery, prefsQuery, resolveLiveFilters, schoolsQuery } from '../medschools.queries';
import type { LiveEventDto, MedListDto, MedSchoolListItemDto } from '../medschools.contract';
import type { Prefs } from '../engine/prefs';
import { programsQueryValue } from '../engine/programs';

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
  (schools: MedSchoolListItemDto[], key: Parameters<typeof schoolsQuery>[0] = {}) =>
  (qc: QueryClient) => {
    qc.setQueryData(schoolsQuery(key).queryKey, { cycleYear: 2026, program: 'ALL', schools, states: ['NC'] });
  };

const list = (id: string, name: string, slugs: string[]): MedListDto => ({
  id,
  name,
  position: 0,
  items: slugs.map((slug, i) => ({
    id: `${id}-${i}`,
    school: { slug, name: slug, shortName: slug, degree: 'MD', state: 'NC', active: true },
    program: 'ANY',
    note: null,
    position: i,
  })),
});

const prefs = (over: Partial<Prefs> = {}): Prefs => ({
  programs: ['md-phd'],
  programFilter: 'PHD',
  degree: 'MD',
  homeState: null,
  chartCategories: [],
  ...over,
});

describe('IndexPage', () => {
  it('lists schools as links with a count and the source name, and has no primary button', () => {
    h.search = {};
    const html = withClient(seedIndex([school('duke'), school('unc')]), <IndexPage />);
    expect(html).toContain('href="/rmh-medschool/duke"');
    expect(html).toContain('href="/rmh-medschool/unc"');
    expect(html).toContain('120 reported invites, CycleTrack');
    expect(html).toContain('MD · Durham, NC');
    expect(html).not.toContain('data-variant="primary"');
  });
  it('no longer headlines the invites reported today, nor carries the reported-events note', () => {
    h.search = {};
    const html = withClient(seedIndex([school('duke')]), <IndexPage />);
    expect(html).not.toContain('reported today');
    expect(html).not.toContain('Reported events, not applicants');
    expect(root('./IndexPage.tsx')).not.toMatch(/todayQuery|ReportedNote/);
  });
  it('has four program toggles in a labelled group, all on without a preference or a URL', () => {
    h.search = {};
    const html = withClient(seedIndex([school('duke')]), <IndexPage />);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Programs"');
    for (const label of ['>MD<', '>MD-PhD<', '>DO<', '>DO-PhD<']) expect(html).toContain(label);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(4);
  });
  it('pluralises and groups the reported count', () => {
    h.search = {};
    const html = withClient(
      seedIndex([
        school('one', { reported: { source: 'ADMIT', count: 1 } }),
        school('many', { reported: { source: 'ADMIT', count: 1200 } }),
      ]),
      <IndexPage />,
    );
    expect(html).toContain('1 reported invite, Admit.org');
    expect(html).toContain('1,200 reported invites, Admit.org');
  });
  it('prints nothing in the figure slot of a school with no data', () => {
    h.search = {};
    const html = withClient(seedIndex([school('duke'), school('quiet', { reported: null })]), <IndexPage />);
    expect(html).toContain('href="/rmh-medschool/quiet"');
    expect(html).not.toContain('No reported invites');
    expect(html.match(/reported invites/g)).toHaveLength(1);
  });
  it('shows the empty state for no schools', () => {
    h.search = {};
    const html = withClient(seedIndex([]), <IndexPage />);
    expect(html).not.toContain('/rmh-medschool/duke');
    expect(html).toContain('data-slot="empty-state"');
  });

  it('SSR parity: a preference fills a silent URL, the public query sits under the explicit key, not the empty one', () => {
    h.search = {};
    h.session = { user: { id: 'u1' } };
    const qc = new QueryClient();
    qc.setQueryData(prefsQuery().queryKey, prefs());
    const key = schoolsQuery({ programs: 'md-phd' }).queryKey;
    qc.setQueryData(key, { cycleYear: 2026, program: 'PHD', schools: [school('duke')], states: [] });
    const html = renderToString(
      <QueryClientProvider client={qc}>
        <IndexPage />
      </QueryClientProvider>,
    );
    expect(html).toContain('href="/rmh-medschool/duke"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('Filters from your preferences.');
    expect(qc.getQueryData(schoolsQuery({}).queryKey)).toBeUndefined();
    expect(programsQueryValue(['md-phd'])).toBe('md-phd');
    h.session = null;
  });
  it('the URL beats the preference, including every program on', () => {
    h.search = { programs: 'md,md-phd,do,do-phd' };
    h.session = { user: { id: 'u1' } };
    const qc = new QueryClient();
    qc.setQueryData(prefsQuery().queryKey, prefs());
    qc.setQueryData(schoolsQuery({}).queryKey, {
      cycleYear: 2026,
      program: 'ALL',
      schools: [school('duke')],
      states: [],
    });
    const html = renderToString(
      <QueryClientProvider client={qc}>
        <IndexPage />
      </QueryClientProvider>,
    );
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(4);
    expect(html).not.toContain('Filters from your preferences.');
    h.session = null;
  });

  it('Show my lists only: ?list=all keeps exactly the listed schools and changes no public key', () => {
    h.search = { list: 'all' };
    h.session = { user: { id: 'u1' } };
    const qc = new QueryClient();
    seedIndex([school('duke'), school('unc'), school('wake'), school('ecu'), school('gone')])(qc);
    qc.setQueryData(listsQuery().queryKey, {
      lists: [list('l1', 'Reach', ['duke']), list('l2', 'Safety', ['wake', 'not-in-index'])],
    });
    const html = renderToString(
      <QueryClientProvider client={qc}>
        <IndexPage />
      </QueryClientProvider>,
    );
    expect(html).toContain('href="/rmh-medschool/duke"');
    expect(html).toContain('href="/rmh-medschool/wake"');
    expect(html).not.toContain('href="/rmh-medschool/unc"');
    expect(html).not.toContain('href="/rmh-medschool/ecu"');
    expect(qc.getQueryCache().findAll({ queryKey: ['medschools', 'schools'] })).toHaveLength(1);
    h.session = null;
  });
  it('a signed-out viewer of a ?list= link sees every school and one line saying why', () => {
    h.search = { list: 'all' };
    h.session = null;
    const html = withClient(seedIndex([school('duke'), school('unc')]), <IndexPage />);
    expect(html).toContain('href="/rmh-medschool/duke"');
    expect(html).toContain('href="/rmh-medschool/unc"');
    expect(html).toContain('This link filters to a saved list.');
  });

  it('Save to list is on every row for a signed-in viewer and absent signed out', () => {
    h.search = {};
    h.session = { user: { id: 'u1' } };
    const signedIn = withClient(seedIndex([school('duke'), school('unc')]), <IndexPage />);
    expect(signedIn.match(/aria-label="Save [a-z]+ University School of Medicine to a list"/g)).toHaveLength(2);
    expect(signedIn).toContain('href="/rmh-medschool/tracker"');
    expect(signedIn).toContain('href="/rmh-medschool/lists"');
    h.session = null;
    const out = withClient(seedIndex([school('duke'), school('unc')]), <IndexPage />);
    expect(out).not.toContain('to a list');
    expect(out).not.toContain('href="/rmh-medschool/tracker"');
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
  wave: false,
  ...o,
});

describe('LivePage', () => {
  const seedLive =
    (events: LiveEventDto[], schools: MedSchoolListItemDto[] = [school('duke')], key = {}) =>
    (qc: QueryClient) => {
      qc.setQueryData(schoolsQuery({}).queryKey, { cycleYear: 2026, program: 'ALL', schools, states: [] });
      qc.setQueryData(liveQuery(key).queryKey, { events, nextCursor: null, asOf: '2026-11-20T15:05:00.000Z' });
    };
  it('renders each row and no identifier, without the reported-events note', () => {
    h.search = {};
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
    expect(html).not.toContain('Reported events, not applicants');
    expect(html).not.toMatch(/@|\/u\/|cabc123|cdef456/);
  });
  it('has the four program toggles', () => {
    h.search = {};
    const html = withClient(seedLive([ev('a1')]), <LivePage />);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(4);
  });
  it('shows only the UTC day for an SDN event stored at midnight, and a relative time otherwise', () => {
    h.search = {};
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
  it("resolveLiveFilters narrows the set to the filtered school's degree and drops a contradicting one", () => {
    const all = ['md', 'md-phd', 'do', 'do-phd'] as const;
    expect(resolveLiveFilters({ school: 'duke', programs: ['md-phd', 'do'] }, 'MD')).toEqual({
      school: 'duke',
      programs: 'md-phd',
    });
    expect(resolveLiveFilters({ school: 'duke', programs: ['do'] }, 'MD')).toEqual({ school: 'duke' });
    expect(resolveLiveFilters({ programs: [...all] }, undefined)).toEqual({});
    expect(resolveLiveFilters({ type: 'HOLD', programs: ['do', 'md'] }, undefined)).toEqual({
      type: 'HOLD',
      programs: 'md,do',
    });
  });
  it('uses mergeLiveHead and refetches every 60 s', () => {
    const src = root('./useLiveFeed.ts');
    expect(src).toContain('mergeLiveHead');
    expect(squash(src)).toContain('refetchInterval:60_000');
    expect(squash(src)).toContain('refetchIntervalInBackground:false');
    // A gap between the fetched head and the old rows drops the older pages.
    expect(src).toContain('merged.gap');
    expect(root('./LivePage.tsx')).toContain('useLiveFeed');
  });
});

describe('route files', () => {
  for (const [file, path, parser, component] of [
    ['index', '/_site/rmh-medschool/', 'validateIndexSearch', 'IndexPage'],
    ['live', '/_site/rmh-medschool/live', 'validateLiveSearch', 'LivePage'],
  ] as const) {
    it(`${file}.tsx is a thin route`, () => {
      const src = squash(root(`../../../app/routes/_site/rmh-medschool/${file}.tsx`));
      expect(src).toContain(`createFileRoute('${path}')`);
      expect(src).toContain('head:definePage(');
      expect(src).toContain(`validateSearch:${parser}`);
      expect(src).toContain('loaderDeps:');
      // D14: no strip middleware, so `?programs=` survives as "I chose these" against a preference.
      expect(src).not.toContain('stripSearchParams(');
      expect(src).toContain('loader:');
      expect(src).toContain('prefetch');
      expect(src).toContain(`component:${component}`);
    });
  }

  it('every public loader awaits the private prefs first, then prefetches public queries with explicit parameters', () => {
    for (const file of ['index', 'live', '$slug']) {
      const src = root(`../../../app/routes/_site/rmh-medschool/${file}.tsx`);
      const at = src.indexOf('loadPrefs(');
      expect(at, file).toBeGreaterThan(-1);
      expect(src.indexOf('await loadPrefs(') < src.search(/prefetch\w*\(|loadSchoolHead\(/), file).toBe(true);
      expect(src, file).not.toMatch(/userId|session/);
    }
    const q = root('../medschools.queries.ts');
    const body = q.slice(q.indexOf('export async function loadPrefs'));
    expect(body.indexOf('prefetchRouteQuery(queryClient, prefsQuery())')).toBeGreaterThan(-1);
  });

  it('the public endpoint requests the loaders make carry only documented public keys', () => {
    const key = JSON.stringify(schoolsQuery({ q: 'x', state: 'NC', programs: 'md' }).queryKey);
    const live = JSON.stringify(liveQuery({ programs: 'md', school: 'duke' }).queryKey);
    for (const k of [key, live]) expect(k).not.toMatch(/list|userId|prefs/);
  });

  it('/tracker and /lists have their own route files next to $slug', () => {
    for (const f of ['tracker', 'lists', '$slug']) {
      expect(() => root(`../../../app/routes/_site/rmh-medschool/${f}.tsx`)).not.toThrow();
    }
  });
});

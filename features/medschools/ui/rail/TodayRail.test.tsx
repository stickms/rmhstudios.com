import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ search: {} as Record<string, unknown>, session: null as unknown }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k] ?? '')),
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
vi.mock('@/components/session/session-context', () => ({
  useSession: () => ({ data: h.session, isPending: false }),
}));

import TodayRail from './TodayRail';
import TodaySummary from './TodaySummary';
import { memberSlugs, yourSchools } from './your-schools';
import { indexQuery, listsQuery, liveSummaryQuery, schoolsQuery, trackerQuery } from '../../medschools.queries';
import type { LiveSchoolDto, MedLiveSummaryRes, MedSchoolListItemDto, TrackerDto } from '../../medschools.contract';
import { PROGRAM_KEYS } from '../../engine/programs';

const school = (slug: string, name: string): LiveSchoolDto => ({
  slug,
  shortName: name,
  name,
  degree: 'MD',
  city: 'Durham',
  state: 'NC',
});
const SUMMARY: MedLiveSummaryRes = {
  asOf: '2026-11-24T12:00:00.000Z',
  since: '2026-11-23T12:00:00.000Z',
  counts: [
    { eventType: 'INTERVIEW', count: 14 },
    { eventType: 'ACCEPTANCE', count: 3 },
  ],
  waves: [{ school: school('duke', 'Duke University'), count: 9 }],
  active: [
    { school: school('duke', 'Duke University'), count: 11 },
    { school: school('emory', 'Emory University'), count: 4 },
  ],
};
const listItem = (slug: string, name: string, latest: MedSchoolListItemDto['latest']): MedSchoolListItemDto => ({
  slug,
  name,
  shortName: name,
  degree: 'MD',
  city: 'City',
  state: 'NC',
  reported: null,
  latest,
});
const at = (iso: string, eventType: 'ACCEPTANCE' | 'WAITLIST' = 'ACCEPTANCE') => ({
  eventType,
  occurredAt: iso,
  dayOnly: false,
});

function render(summary: MedLiveSummaryRes | null, seed?: (qc: QueryClient) => void): string {
  const qc = new QueryClient();
  if (summary) qc.setQueryData(liveSummaryQuery({}).queryKey, summary);
  seed?.(qc);
  return renderToString(
    <QueryClientProvider client={qc}>
      <TodaySummary enabled />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.search = {};
  h.session = null;
});

describe('TodayRail (the live page column)', () => {
  it('server-renders the rail frame and a static skeleton at every width, and mounts no summary there', () => {
    const html = renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <TodayRail />
      </QueryClientProvider>,
    );
    expect(html).toContain('medapp-panel medapp-panel--rail medapp-today');
    expect(html).toContain('data-today-skeleton=""');
    expect(html).not.toContain('Reported in the last 24 hours');
    expect(html).not.toMatch(/@keyframes|animation/);
  });

  it('lazy-loads the summary and gates every query it owns on the column showing', () => {
    const rail = readFileSync('features/medschools/ui/rail/TodayRail.tsx', 'utf8');
    expect(rail).toContain("lazy(() => import('./TodaySummary'))");
    expect(rail).toContain("useMediaQuery('(min-width: 1280px)')");
    const src = readFileSync('features/medschools/ui/rail/TodaySummary.tsx', 'utf8');
    const calls = src.match(/useQuery\(\{[\s\S]*?\}\);/g) ?? [];
    expect(calls).toHaveLength(4);
    for (const c of calls) expect(c).toMatch(/enabled(: (enabled|on))?[,\s]/);
    expect(src).toContain('const on = enabled && !!session');
  });
});

describe('TodaySummary', () => {
  it('labels the counts honestly and draws one row per type with its status and a tabular count', () => {
    const html = render(SUMMARY);
    expect(html).toContain('Reported in the last 24 hours');
    expect(html).not.toMatch(/applicants/i);
    expect(html).toContain('Interview invite');
    expect(html).toContain('Acceptance');
    expect(html.match(/<button type="button" class="medapp-today__row medapp-today__btn"/g)).toHaveLength(2);
    expect(html).toContain('medapp-status-icon medapp-status-icon--sm medapp-status--interview');
    expect(html).toMatch(/aria-pressed="false"/);
    expect(html).not.toMatch(/aria-pressed="true"/);
  });

  it("shows the page's type filter as the pressed row", () => {
    h.search = { type: 'ACCEPTANCE' };
    const html = render(SUMMARY);
    const pressed = html.match(/<button[^>]*aria-pressed="true"[^>]*>.*?<\/button>/)?.[0] ?? '';
    expect(pressed).toContain('Acceptance');
    expect(pressed).toContain('>3<');
  });

  it('lists the waves and the most active schools, linked to their pages', () => {
    const html = render(SUMMARY);
    expect(html).toContain('Waves now');
    expect(html).toContain('Interview wave · 9 today');
    expect(html).toContain('Most active, last 24 hours');
    expect(html).toContain('href="/med/emory"');
    expect(html).toMatch(/>4<span class="sr-only"> <!-- -->reported events<\/span>/);
  });

  it('hides the waves block when there are none, and says so when nothing was reported', () => {
    const html = render({ ...SUMMARY, counts: [], waves: [], active: [] });
    expect(html).not.toContain('Waves now');
    expect(html).not.toContain('Most active');
    expect(html).toContain('Nothing reported in the last 24 hours.');
  });

  it('before the summary lands is the same skeleton the server drew', () => {
    expect(render(null)).toContain('data-today-skeleton=""');
  });

  it('signed out has no "Your schools" block at all', () => {
    expect(render(SUMMARY)).not.toContain('Your schools');
  });

  it("signed in joins the member's schools with the public newest status, newest first", () => {
    h.session = { user: { id: 'u' } };
    const tracker: TrackerDto = {
      sharingAvailable: true,
      cycles: [2027],
      cycle: {
        cycleYear: 2027,
        homeState: null,
        shareAnonymously: false,
        applications: [
          {
            id: 'a',
            school: {
              slug: 'duke',
              name: 'Duke University',
              shortName: 'Duke',
              degree: 'MD',
              state: 'NC',
              active: true,
            },
            program: 'REG',
            notes: null,
            milestones: [],
          },
        ],
      },
    } as TrackerDto;
    const html = render(SUMMARY, (qc) => {
      qc.setQueryData(trackerQuery().queryKey, tracker);
      qc.setQueryData(listsQuery().queryKey, { lists: [] });
      qc.setQueryData(schoolsQuery(indexQuery({}, { programs: PROGRAM_KEYS })).queryKey, {
        cycleYear: 2027,
        program: 'ALL',
        states: ['NC'],
        schools: [
          listItem('duke', 'Duke University', at('2026-11-24T10:00:00.000Z', 'WAITLIST')),
          listItem('emory', 'Emory University', at('2026-11-24T11:00:00.000Z')),
        ],
      });
    });
    expect(html).toContain('Your schools');
    const yours = html.slice(html.indexOf('Your schools'));
    expect(yours).toContain('Duke University');
    expect(yours).toContain('Waitlist');
    // Emory is not one of the member's schools.
    expect(yours).not.toContain('Emory University');
  });
});

describe('your-schools join (pure)', () => {
  const schools = [
    listItem('a', 'A', at('2026-11-20T10:00:00.000Z')),
    listItem('b', 'B', at('2026-11-22T10:00:00.000Z')),
    listItem('c', 'C', null),
    listItem('d', 'D', at('2026-11-21T10:00:00.000Z')),
  ];

  it('takes the schools on the tracker and the lists, each once', () => {
    const slugs = memberSlugs(
      {
        cycle: { applications: [{ school: { slug: 'a' } }] },
      } as unknown as TrackerDto,
      { lists: [{ items: [{ school: { slug: 'b' } }, { school: { slug: 'a' } }] }] } as never,
    );
    expect([...slugs].sort()).toEqual(['a', 'b']);
    expect(memberSlugs(undefined, undefined).size).toBe(0);
  });

  it('keeps those with a public status, newest first, at most the cap', () => {
    const slugs = new Set(['a', 'b', 'c', 'd']);
    expect(yourSchools(slugs, schools).map((s) => s.slug)).toEqual(['b', 'd', 'a']);
    expect(yourSchools(slugs, schools, 2).map((s) => s.slug)).toEqual(['b', 'd']);
    expect(yourSchools(new Set(['c']), schools)).toEqual([]);
    expect(yourSchools(slugs, undefined)).toEqual([]);
  });
});

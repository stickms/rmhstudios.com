import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

process.env.TZ = 'America/Los_Angeles';

const h = vi.hoisted(() => ({ session: null as null | { user: { id: string; createdAt?: string } } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k] ?? '')),
    i18n: { language: 'en-US' },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...rest
  }: {
    to: string;
    params?: { slug: string };
    search?: unknown;
    children: ReactNode;
  }) => (
    <a href={params ? to.replace('$slug', params.slug) : to} data-search={JSON.stringify(search ?? null)} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => () => undefined,
  useSearch: () => ({}),
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
  Select: ({
    value,
    children,
    disabled,
    ...rest
  }: {
    value: string;
    children: ReactNode;
    disabled?: boolean;
    'aria-label'?: string;
  }) => (
    <select aria-label={rest['aria-label']} defaultValue={value} disabled={disabled}>
      {children}
    </select>
  ),
}));
vi.mock('@/components/session/session-context', () => ({
  useSession: () => ({ data: h.session, isPending: false }),
}));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => () => Promise.resolve(false) }));
vi.mock('@/components/errors/useRefusalText', () => ({
  useRefusalText: () => Object.assign((e: unknown) => String(e), { maybe: (e: unknown) => String(e) }),
}));

import { TrackerPage } from './TrackerPage';
import { MilestoneForm } from './MilestoneForm';
import { HttpError } from '@/lib/http';
import { chancesQuery, trackerQuery } from '../../medschools.queries';
import type { ChanceDto, MedChancesRes, TrackerApplicationDto, TrackerDto } from '../../medschools.contract';

const app = (o: Partial<TrackerApplicationDto> & Pick<TrackerApplicationDto, 'id'>): TrackerApplicationDto => ({
  school: {
    slug: 'duke',
    name: 'Duke University School of Medicine',
    shortName: 'Duke',
    degree: 'MD',
    state: 'NC',
    active: true,
  },
  program: 'REG',
  notes: null,
  milestones: [],
  ...o,
});

const dto = (o: Partial<TrackerDto> = {}): TrackerDto => ({
  sharingAvailable: true,
  cycles: [2027],
  cycle: {
    cycleYear: 2027,
    homeState: null,
    shareAnonymously: false,
    applications: [
      app({ id: 'a1', milestones: [{ type: 'INTERVIEW', date: '2026-11-20' }] }),
      app({
        id: 'a2',
        school: {
          slug: 'ohio-do',
          name: 'Ohio DO College',
          shortName: 'Ohio DO',
          degree: 'DO',
          state: 'OH',
          active: true,
        },
        program: 'PHD',
        notes: '<img src=x onerror=1>',
      }),
    ],
  },
  ...o,
});

const chance = (o: Partial<ChanceDto> & Pick<ChanceDto, 'applicationId'>): ChanceDto => ({
  school: { slug: 'duke', shortName: 'Duke', name: 'Duke University School of Medicine', active: true },
  program: 'REG',
  status: 'thin',
  completeOn: null,
  invitedOn: null,
  asOf: null,
  basis: null,
  points: [],
  ...o,
});

/** `chances`: the answer, or an error the query is in. Absent means the query was never answered. */
function render(
  data: TrackerDto | null,
  signedIn = true,
  chances?: MedChancesRes | Error,
  cycle: number | undefined = 2027,
): string {
  h.session = signedIn ? { user: { id: 'u1' } } : null;
  // An errored query would be refetched on mount and render as pending; keep it as the test set it.
  const qc = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });
  if (data) qc.setQueryData(trackerQuery(undefined).queryKey, data);
  if (chances instanceof Error) {
    qc.getQueryCache()
      .build(qc, { queryKey: chancesQuery({ cycle }).queryKey })
      .setState({ status: 'error', error: chances, fetchStatus: 'idle', errorUpdateCount: 1 });
  } else if (chances) qc.setQueryData(chancesQuery({ cycle }).queryKey, chances);
  return renderToString(
    <QueryClientProvider client={qc}>
      <TrackerPage />
    </QueryClientProvider>,
  );
}

const primaries = (html: string) => (html.match(/data-variant="primary"/g) ?? []).length;

describe('TrackerPage signed out', () => {
  it('shows the sign-in prompt with the return path and no tracker markup', () => {
    const html = render(dto(), false);
    expect(html).toContain('Sign in to track your cycle');
    expect(html).toContain('href="/login"');
    expect(html).toContain('/rmh-medschool/tracker');
    expect(html).not.toContain('Share my milestones');
    expect(html).not.toContain('Duke');
  });
});

describe('TrackerPage signed in', () => {
  it('links each school to its page, labels programs by degree and dates in UTC', () => {
    const html = render(dto());
    expect(html).toContain('href="/rmh-medschool/duke"');
    expect(html).toContain('Interview invite, Nov 20');
    expect(html).toContain('DO-PhD');
    expect(html).not.toContain('MD-PhD');
    expect(html).toContain('MD · NC · MD');
  });

  it('renders notes as text, never HTML', () => {
    const html = render(dto());
    expect(html).toContain('&lt;img src=x onerror=1&gt;');
    expect(html).not.toContain('<img src=x');
  });

  it('degrades the link to plain text for a deactivated school', () => {
    const d = dto();
    d.cycle!.applications[0]!.school.active = false;
    const html = render(d);
    expect(html).not.toContain('href="/rmh-medschool/duke"');
    expect(html).toContain('Duke University School of Medicine');
  });

  it('the sharing switch has a name, mirrors the DTO and explains the 3-person floor', () => {
    const off = render(dto());
    expect(off).toContain('role="switch"');
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain('aria-labelledby');
    expect(off).toContain('aria-describedby');
    expect(off).toContain('at least 3 people');
    expect(off).toContain('never shared');
    expect(off).toContain('update once a day');
    expect(off).not.toMatch(/applicants/i);
    const d = dto();
    d.cycle!.shareAnonymously = true;
    expect(render(d)).toContain('aria-checked="true"');
  });

  it('disables the switch with the unavailable line when sharing is unavailable', () => {
    const html = render(dto({ sharingAvailable: false }));
    expect(html).toMatch(/role="switch"[^>]*disabled|disabled=""[^>]*role="switch"/);
    expect(html).toContain('Sharing is unavailable right now.');
  });

  it('explains a too-new account and disables turning sharing on', () => {
    h.session = { user: { id: 'u1', createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() } };
    const qc = new QueryClient();
    qc.setQueryData(trackerQuery(undefined).queryKey, dto());
    const html = renderToString(
      <QueryClientProvider client={qc}>
        <TrackerPage />
      </QueryClientProvider>,
    );
    expect(html).toContain('Sharing needs an account at least 7 days old');
    expect(html).toMatch(/role="switch"[^>]*disabled|disabled=""[^>]*role="switch"/);
  });

  it('an old enough account sees no age note', () => {
    h.session = { user: { id: 'u1', createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString() } };
    const qc = new QueryClient();
    qc.setQueryData(trackerQuery(undefined).queryKey, dto());
    const html = renderToString(
      <QueryClientProvider client={qc}>
        <TrackerPage />
      </QueryClientProvider>,
    );
    expect(html).not.toContain('days old');
  });

  it('has exactly one ink primary: Add school when populated, Add cycle when empty', () => {
    expect(primaries(render(dto()))).toBe(1);
    expect(render(dto())).toContain('Add school');
    const empty = render(dto({ cycles: [], cycle: null }));
    expect(primaries(empty)).toBe(1);
    expect(empty).toContain('No cycle yet');
    expect(empty).not.toContain('Add school');
    const none = dto();
    none.cycle!.applications = [];
    const html = render(none);
    expect(primaries(html)).toBe(1);
    expect(html).toContain('No schools yet');
  });

  it('states that home state is never shared', () => {
    expect(render(dto())).toContain('Never shared.');
  });
});

describe('TrackerPage invite chance', () => {
  const answer = (...chances: ChanceDto[]): MedChancesRes => ({ cycleYear: 2027, chances });
  const estimate = chance({
    applicationId: 'a1',
    status: 'estimate',
    completeOn: '2026-10-31',
    asOf: '2026-11-19',
    basis: 30,
    points: [
      { on: '2026-11-27', percent: 29 },
      { on: '2026-12-20', percent: 57 },
    ],
  });

  it('an estimate is a row per horizon with a calendar date, then where it comes from', () => {
    const html = render(dto(), true, answer(estimate));
    expect(html).toContain('If you have not heard by today, the chance of an interview invite:');
    expect(html).toContain('by \u2068Nov 27\u2069 \u00b7 \u206829%\u2069');
    expect(html).toContain('by \u2068Dec 20\u2069 \u00b7 \u206857%\u2069');
    expect(html.match(/chance of an interview invite/g)).toHaveLength(1);
    expect(html).toContain('Estimate as of Nov 19, from at least 30 members&#x27; applications at this school.');
    expect(html).not.toMatch(/day \d|!/);
  });

  it('each other status shows its line, and closed shows nothing', () => {
    const lines: [ChanceDto['status'], string][] = [
      ['thin', 'Not enough data yet for an estimate here. It needs at least 20 members at this school.'],
      ['no-complete', 'Add the date your application was complete to see an estimate.'],
      ['not-complete-yet', 'The complete date is still ahead. The estimate starts once it has passed.'],
      ['beyond', 'Too few comparable applications are still waiting at this point for an estimate.'],
    ];
    for (const [status, text] of lines) {
      expect(render(dto(), true, answer(chance({ applicationId: 'a1', status })))).toContain(text);
    }
    expect(
      render(dto(), true, answer(chance({ applicationId: 'a1', status: 'invited', invitedOn: '2026-11-20' }))),
    ).toContain('Invited on Nov 20.');
    expect(render(dto(), true, answer(chance({ applicationId: 'a1', status: 'closed' })))).not.toContain('data-chance');
  });

  it('a line belongs to its own application only', () => {
    const html = render(dto(), true, answer(chance({ applicationId: 'a2', status: 'no-complete' })));
    expect(html.match(/data-chance/g)).toHaveLength(1);
    expect(html.indexOf('data-chance')).toBeGreaterThan(html.indexOf('Ohio DO College'));
  });

  it('a failed chances request leaves the tracker whole: no line, no banner', () => {
    const html = render(dto(), true, new HttpError(500, 'boom'));
    expect(html).toContain('Duke University School of Medicine');
    expect(html).not.toContain('data-chance');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('Sign in to track your cycle');
  });

  it('a 401 on chances after load is the session-expiry path', () => {
    expect(render(dto(), true, new HttpError(401, 'no'))).toContain('Sign in to track your cycle');
  });

  it('a cycle with no applications asks for no chances', () => {
    const none = dto();
    none.cycle!.applications = [];
    const qc = new QueryClient();
    h.session = { user: { id: 'u1' } };
    qc.setQueryData(trackerQuery(undefined).queryKey, none);
    renderToString(
      <QueryClientProvider client={qc}>
        <TrackerPage />
      </QueryClientProvider>,
    );
    const q = qc.getQueryCache().find({ queryKey: ['medschools', 'me', 'chances'] });
    expect(q?.getObserversCount() ?? 0).toBeLessThanOrEqual(1);
    expect(q?.isDisabled() ?? true).toBe(true);
  });

  it('the sharing row has the estimate line whether sharing is on or off, and the shipped copy is unchanged', () => {
    for (const on of [false, true]) {
      const d = dto();
      d.cycle!.shareAnonymously = on;
      const html = render(d);
      expect(html).toContain('feeds an estimate shown for this school once at least 20 members contribute');
      expect(html).toContain('Only the estimate is shown, never a date or a row.');
      expect(html).toContain('Your submission and completion dates and your home state are never shared');
    }
  });

  it('the tracker still has one ink primary with chance rows on it', () => {
    expect(primaries(render(dto(), true, answer(estimate)))).toBe(1);
  });
});

describe('MilestoneForm', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  const form = (extra: Partial<Parameters<typeof MilestoneForm>[0]> = {}) =>
    renderToString(
      <MilestoneForm
        cycleYear={2027}
        existing={[{ type: 'INTERVIEW' }, { type: 'SUBMITTED' }]}
        onSave={() => Promise.resolve()}
        onCancel={() => undefined}
        now={now}
        {...extra}
      />,
    );

  it('add offers only the types not set yet', () => {
    const html = form();
    expect(html).not.toContain('>Interview invite<');
    expect(html).not.toContain('>Application submitted<');
    expect(html).toContain('>Application complete<');
    expect(html).toContain('>Acceptance<');
  });

  it('the date input carries the cycle window', () => {
    const html = form();
    expect(html).toContain('min="2026-05-01"');
    expect(html).toContain('max="2026-11-21"');
    expect(html).toContain('type="date"');
  });

  it('edit fixes the type and prefills the date', () => {
    const html = form({ editing: { type: 'INTERVIEW', date: '2026-11-20' }, onRemove: () => Promise.resolve() });
    expect(html).toContain('value="2026-11-20"');
    expect(html).toContain('aria-label="Remove milestone"');
    expect(html).not.toContain('>Acceptance<');
  });

  it('every milestone set: says so instead of an empty select', () => {
    const all = (
      [
        'SUBMITTED',
        'COMPLETE',
        'SECONDARY',
        'SECONDARY_SUBMITTED',
        'INTERVIEW',
        'WAITLIST',
        'REJECTION',
        'ACCEPTANCE',
        'WITHDRAWN',
        'HOLD',
      ] as const
    ).map((type) => ({ type }));
    expect(form({ existing: all })).toContain('Every milestone is already set');
  });
});

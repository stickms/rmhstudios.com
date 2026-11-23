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
import { trackerQuery } from '../../medschools.queries';
import type { TrackerApplicationDto, TrackerDto } from '../../medschools.contract';

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

function render(data: TrackerDto | null, signedIn = true): string {
  h.session = signedIn ? { user: { id: 'u1' } } : null;
  const qc = new QueryClient();
  if (data) qc.setQueryData(trackerQuery(undefined).queryKey, data);
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

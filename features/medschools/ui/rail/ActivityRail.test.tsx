import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

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
  useSearch: () => ({}),
}));
vi.mock('@/components/session/session-context', () => ({ useSession: () => ({ data: null, isPending: false }) }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, children, ...rest }: { value: string; children: ReactNode; 'aria-label'?: string }) => (
    <select aria-label={rest['aria-label']} defaultValue={value}>
      {children}
    </select>
  ),
}));

import ActivityRail from './ActivityRail';
import { liveQuery } from '../../medschools.queries';
import type { LiveEventDto } from '../../medschools.contract';

const ev = (id: string): LiveEventDto => ({
  id,
  eventType: 'ACCEPTANCE',
  program: 'PHD',
  school: { slug: 'duke', shortName: 'Duke', name: 'Duke University', degree: 'MD', city: 'Durham', state: 'NC' },
  occurredAt: '2026-11-20T15:04:00.000Z',
  source: 'ADMIT',
  wave: false,
});

function render(events: LiveEventDto[] | null): string {
  const qc = new QueryClient();
  if (events) qc.setQueryData(liveQuery({ limit: 15 }).queryKey, { events, nextCursor: 'x', asOf: 'now' });
  return renderToString(
    <QueryClientProvider client={qc}>
      <ActivityRail />
    </QueryClientProvider>,
  );
}

describe('ActivityRail', () => {
  it('shows the newest events with school, event, program, place and time, and no source line', () => {
    const html = render([ev('a1'), ev('a2')]);
    expect(html).toContain('Live activity');
    expect(html).toContain('href="/rmh-medschool/duke"');
    expect(html).toContain('Acceptance');
    expect(html).toContain('MD-PhD · Durham, NC');
    expect(html).not.toContain('Admit.org');
    expect(html.match(/<li/g)).toHaveLength(2);
  });

  it('has a search, then the event types and the programs as two multi-selects', () => {
    const html = render([ev('a1')]);
    expect(html).toContain('type="search"');
    expect(html).toContain('aria-label="Search activity"');
    expect(html).toContain('aria-label="Event"');
    expect(html).toContain('aria-label="Programs"');
    const programs = html.slice(html.indexOf('role="group" aria-label="Programs"'));
    expect(programs.match(/<input type="checkbox" class="medapp-check"[^>]*checked=""/g)).toHaveLength(4);
    // Every event type is a checkbox with its status disc; all on reads "All events".
    expect(html).toContain('aria-label="Event: All events"');
    expect(html.match(/medapp-status-icon medapp-status-icon--sm/g)!.length).toBeGreaterThanOrEqual(7);
  });

  it('draws the sentinel only while more pages exist', () => {
    expect(render([ev('a1')])).toContain('h-px');
  });

  it('says so when nothing has loaded or matches', () => {
    expect(render(null)).toContain('Loading');
    expect(render([])).toContain('Nothing matches yet.');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string; n?: number }) =>
      (o?.defaultValue ?? '').replace('{{n}}', String(o?.n ?? '')),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/components/events/EventCard', () => ({
  EventCard: ({ event }: { event: { id: string; title: string } }) => (
    <article data-event={event.id}>{event.title}</article>
  ),
}));
vi.mock('@/components/events/EventComposer', () => ({ EventComposer: () => null }));

import { CommunityEventsView } from '@/components/communities/CommunityEventsPanel';
import type { EventDTO } from '@/lib/events.server';

const ev = (id: string, title: string) => ({ id, title }) as unknown as EventDTO;
const noop = () => undefined;
const view = (props: Partial<Parameters<typeof CommunityEventsView>[0]>) =>
  renderToStaticMarkup(
    <CommunityEventsView
      events={[]}
      isMod={false}
      onHost={noop}
      pastOpen={false}
      onShowPast={noop}
      past={undefined}
      pastLoading={false}
      pastFailed={false}
      {...props}
    />,
  );

describe('community events panel', () => {
  it('says so when nothing is coming up, and offers no host button to a member', () => {
    const html = view({});
    expect(html).toContain('No events yet');
    expect(html).toContain('When a moderator hosts an event');
    expect(html).not.toContain('Host an event');
  });

  it('shows the host button to a moderator only', () => {
    expect(view({ isMod: true })).toContain('Host an event');
    expect(view({ isMod: false })).not.toContain('Host an event');
  });

  it('lists upcoming events as rows on a rule, and counts them', () => {
    const html = view({ events: [ev('a', 'Game night'), ev('b', 'Meet-up')] });
    expect(html).toContain('2 coming up');
    expect(html).toContain('data-event="a"');
    expect(html).toContain('data-event="b"');
    expect(html).toContain('border-b border-site-border');
  });

  it('keeps the past list behind its button, then shows it read from the second list', () => {
    expect(view({})).toContain('Show past events');
    const open = view({ pastOpen: true, past: [ev('p1', 'Old night')] });
    expect(open).not.toContain('Show past events');
    expect(open).toContain('data-event="p1"');
    expect(view({ pastOpen: true, past: [] })).toContain('No past events.');
  });
});

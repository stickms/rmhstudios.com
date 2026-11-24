import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string }) => o.defaultValue,
    i18n: { language: 'en-US' },
  }),
}));

import { EventTime } from './EventTime';

describe('EventTime (server render)', () => {
  it('is a focusable <time> with the day as text and an empty, hidden tooltip: no server-zone string in the HTML', () => {
    const html = renderToString(<EventTime iso="2026-11-24T20:42:00.000Z" dayOnly={false} relative />);
    expect(html).toMatch(/<time dateTime="2026-11-24T20:42:00.000Z" tabindex="0" aria-describedby="([^"]+)-tip"/);
    expect(html).toContain('>Nov 24</time>');
    expect(html).toMatch(/<span id="[^"]+-tip" role="tooltip" class="medapp-when__tip" hidden=""><\/span>/);
    expect(html.replace(/dateTime="[^"]*"/, '')).not.toMatch(/\d:\d\d|GMT|UTC|EST/);
  });
  it('a day-only event carries the bare day in dateTime', () => {
    const html = renderToString(<EventTime iso="2026-11-24T00:00:00.000Z" dayOnly />);
    expect(html).toContain('dateTime="2026-11-24"');
  });
  it('nested (inside a button) is one plain <time>, no second focus stop', () => {
    const html = renderToString(<EventTime iso="2026-11-24" dayOnly nested className="medapp-date" />);
    expect(html).toBe('<time dateTime="2026-11-24" class="medapp-date">Nov 24</time>');
  });
});

// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Capture the options the server render formats its fallback with, whatever zone the test runner is in.
const seen: Intl.DateTimeFormatOptions[] = [];
vi.mock('@/hooks/useLocaleFormat', () => ({
  useLocaleFormat: () => ({
    date: (v: string | number | Date, opts?: Intl.DateTimeFormatOptions) => {
      seen.push(opts ?? {});
      return new Intl.DateTimeFormat('en', opts).format(new Date(v));
    },
  }),
}));

const { RelativeTime } = await import('../RelativeTime');

describe('RelativeTime before hydration', () => {
  it('formats its fallback date in UTC, so the server and the hydrating client agree in every zone', () => {
    // 01:00 UTC on 26 November is the evening of the 25th in Los Angeles.
    const html = renderToStaticMarkup(<RelativeTime date="2026-11-26T01:00:00Z" format={() => 'relative'} />);
    expect(seen.at(-1)?.timeZone).toBe('UTC');
    expect(html).toBe('<time dateTime="2026-11-26T01:00:00.000Z">Nov 26</time>');
  });
});

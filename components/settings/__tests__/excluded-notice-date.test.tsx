/**
 * The self-exclusion notice (s14-16) is rendered on the server and hydrated in the browser. Its date must not depend on
 * the zone of either, or a viewer whose day differs from the server's gets a hydration mismatch (React #418): the
 * server render and the first client render both format the end in UTC.
 */
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: Record<string, unknown>) =>
      String(o?.defaultValue ?? _k).replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(o?.[n] ?? '')),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: unknown }) => createElement('a', null, children as never),
}));

const { ExcludedNotice } = await import('../ExcludedNotice');

describe('ExcludedNotice date', () => {
  afterEach(() => vi.restoreAllMocks());

  it('formats the end in UTC on the server, whatever the process zone', () => {
    const spy = vi.spyOn(Date.prototype, 'toLocaleDateString');
    const html = renderToString(createElement(ExcludedNotice, { until: '2027-01-15T03:30:00.000Z' }));
    expect(spy).toHaveBeenCalledWith('en', { dateStyle: 'long', timeZone: 'UTC' });
    expect(html).toContain('January 15, 2027');
  });
});

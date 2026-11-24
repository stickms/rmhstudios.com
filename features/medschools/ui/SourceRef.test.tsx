import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k] ?? '')),
  }),
}));

import { SOURCE_REF_CLOSED, SourceRef, nextSourceRef } from './SourceRef';

describe('SourceRef', () => {
  it('peeks on hover and focus, pins on a press or a tap, and closes on a second press or Escape', () => {
    const peek = nextSourceRef(SOURCE_REF_CLOSED, 'peek');
    expect(peek).toEqual({ open: true, pinned: false });
    // Hover after a press never unpins.
    const pinned = nextSourceRef(peek, 'press');
    expect(pinned).toEqual({ open: true, pinned: true });
    expect(nextSourceRef(pinned, 'peek')).toBe(pinned);
    // A tap on a closed icon opens it pinned: it never navigates by itself.
    expect(nextSourceRef(SOURCE_REF_CLOSED, 'press')).toEqual({ open: true, pinned: true });
    expect(nextSourceRef(pinned, 'press')).toEqual(SOURCE_REF_CLOSED);
    expect(nextSourceRef(peek, 'close')).toEqual(SOURCE_REF_CLOSED);
    expect(nextSourceRef(pinned, 'close')).toEqual(SOURCE_REF_CLOSED);
  });

  it('server-renders a named icon button with the full attribution as its description, and no link', () => {
    const html = renderToString(
      <SourceRef
        name="AAMC MSAR report · Deposit Due Date"
        href="https://aamc.test/7066.pdf#page=3"
        attribution="Source: AAMC MSAR Report for Applicants and Advisors, 2026 entering class, Deposit Due Date"
      />,
    );
    expect(html).toContain('aria-label="Source: AAMC MSAR report · Deposit Due Date"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    const described = /aria-describedby="([^"]+)"/.exec(html)![1]!;
    expect(html).toContain(
      `<span id="${described}" class="sr-only">Source: AAMC MSAR Report for Applicants and Advisors, 2026 entering class, Deposit Due Date</span>`,
    );
    expect(html).toContain('data-href="https://aamc.test/7066.pdf#page=3"');
    expect(html).not.toContain('<a ');
  });
});

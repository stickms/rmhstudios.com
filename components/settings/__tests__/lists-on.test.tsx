// @vitest-environment node
/**
 * Settings > Lists (s13-11): each row names its list, the owner sits in `<bdi>`, the list name is `dir="auto"`, and the
 * one action per row names the list. Server-rendered and read as text (jsdom is not installed).
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      String(o?.defaultValue ?? k).replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o?.[name] ?? '')),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...rest }: { children: unknown; to: string; params?: Record<string, string> }) =>
    createElement('a', { href: to.replace('$id', params?.id ?? ''), ...rest }, children as never),
}));

import { ListsOnRows } from '../ListsOnSection';
import type { ListOnRow } from '@/lib/lists/lists-on';

const row = (over: Partial<ListOnRow> = {}): ListOnRow => ({
  id: 'l1',
  name: 'Friends from the jam',
  owner: { name: 'Olive', handle: 'olive' },
  addedAt: '2026-12-01T12:00:00.000Z',
  ...over,
});

const html = (rows: ListOnRow[], busy: string[] = []) =>
  renderToStaticMarkup(createElement(ListsOnRows, { rows, busy: new Set(busy), onLeave: () => undefined }));

describe('lists you are on: rows', () => {
  it('shows the list, its owner and when it added you, with a leave action that names the list', () => {
    const out = html([row()]);
    expect(out).toContain('Friends from the jam');
    expect(out).toContain('href="/lists/l1"');
    expect(out).toContain('<bdi>Olive</bdi>');
    expect(out).toContain('Added Dec 1, 2026');
    expect(out).toContain('aria-label="Leave Friends from the jam"');
    expect(out).toContain('Leave this list');
  });

  it('gives member-written text its own direction: the name is dir="auto", the owner is isolated', () => {
    const out = html([row({ name: 'قائمة', owner: { name: null, handle: 'zed' } })]);
    expect(out).toContain('<span dir="auto">قائمة</span>');
    expect(out).toContain('<bdi>zed</bdi>');
  });

  it('falls back to a plain word when the owner has neither name nor handle', () => {
    expect(html([row({ owner: { name: null, handle: null } })])).toContain('<bdi>a member</bdi>');
  });

  it('is rows on rules with a text action: no primary button, no box', () => {
    const out = html([row(), row({ id: 'l2', name: 'Second' })]);
    expect(out.match(/border-b border-site-border/g)).toHaveLength(2);
    expect(out).toContain('data-variant="ghost"');
    expect(out).not.toContain('data-variant="primary"');
    expect(out).not.toMatch(/surface-card|surface-panel|shadow/);
  });

  it('disables the action of the row that is leaving', () => {
    const out = html([row()], ['l1']);
    expect(out).toMatch(/<button[^>]*disabled[^>]*>/);
  });
});

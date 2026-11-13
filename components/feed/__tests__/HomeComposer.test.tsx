/**
 * The home composer keeps one look (owner, 2026-11-13). `HomeComposer` draws a light row first and hands over to
 * `ComposeBox` in its `row` variant when a quick action is pressed; the swap is invisible only while both draw the
 * same avatar, field, quick actions and Post. This pins that: the two server-rendered rows are compared part by part.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('@/components/Providers', () => ({
  useSession: () => ({ data: { user: { id: 'u1', name: 'Ana', image: null } }, isPending: false }),
  useResolvedUser: () => ({ resolved: null }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => String(o?.defaultValue ?? k),
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: unknown; to: unknown }) => (
    <a href={String(to)}>{children as never}</a>
  ),
}));
vi.mock('@/components/ui/anchored-menu', () => ({ AnchoredMenu: () => null }));
vi.mock('../compose/useComposeSubmit', () => ({
  useComposeSubmit: () => ({
    handleSubmit: () => {},
    handleThreadPosted: () => {},
    handleSaveScheduled: () => {},
  }),
}));

import { HomeComposer } from '../HomeComposer';
import { ComposeBox } from '../ComposeBox';

/** Attributes that are state, not look: the full composer's field adds its own autocomplete hints. */
const pick = (tag: string, names: string[]) =>
  names.map((n) => `${n}=${new RegExp(` ${n}="([^"]*)"`).exec(tag)?.[1] ?? ''}`).join(' ');

function parts(html: string) {
  const start = html.indexOf('home-composer__row');
  const row = html.slice(html.lastIndexOf('<div', html.lastIndexOf('<div', start) - 1));
  return {
    frame: [...row.matchAll(/<div class="([^"]*)"/g)].map((m) => m[1]).slice(0, 2),
    avatar: /<(img|span|div)[^>]*rounded-full[^>]*>/.exec(row)?.[0],
    field: pick(/<textarea[^>]*>/.exec(row)![0], [
      'class',
      'id',
      'rows',
      'placeholder',
      'aria-label',
    ]),
    tools: [...row.matchAll(/<button[^>]*>/g)].map((m) =>
      pick(m[0], [
        'aria-label',
        'title',
        'class',
        'data-variant',
        'data-size',
        'aria-haspopup',
        'type',
      ]),
    ),
    toolbar: /<div class="([^"]*)"><div class="([^"]*)"><input[^>]*type="file"/.exec(row)?.slice(1),
    post: />Post</.test(row),
  };
}

describe('HomeComposer', () => {
  const light = renderToString(<HomeComposer />);
  const full = renderToString(<ComposeBox variant="row" />);

  it('draws picture, GIF, poll, AI and the three dots, then Post', () => {
    expect(parts(light).tools.map((t) => /aria-label=([^=]*) title/.exec(t)![1])).toEqual([
      'Add Image',
      'Add GIF',
      'Create Poll',
      'AI tools',
      'Post options',
      '',
    ]);
    expect(parts(light).post).toBe(true);
  });

  it('is drawn with the same parts as the full composer it hands over to', () => {
    expect(parts(light)).toEqual(parts(full));
  });

  it('holds nothing but the row until a quick action is pressed', () => {
    expect(light).not.toContain('surface-field');
    expect(light).not.toContain('Improve');
  });
});

// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; count?: number; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name])),
  }),
}));

import { MadeView } from '../plus/MadeModule';
import { MadeSettings } from '../plus/MadeSettings';
import type { MadeItem } from '@/lib/profile/made';

const items: MadeItem[] = [
  {
    kind: 'connections',
    id: 'g1',
    title: 'Birds of a feather',
    href: '/connections/u/g1',
    figure: { unit: 'plays', value: 12 },
  },
  { kind: 'deck', id: 'd1', title: 'ماء', href: '/study/d1', figure: { unit: 'cards', value: 40 } },
  {
    kind: 'chart',
    id: 'c1',
    title: 'Song A',
    href: '/slice-it?q=Song%20A',
    figure: { unit: 'difficulty', value: 'hard' },
  },
  { kind: 'build', id: 'u1', title: 'My build', href: '/builds/my-build', figure: { unit: 'releases', value: 3 } },
];

const render = (over: Partial<Parameters<typeof MadeView>[0]> = {}) =>
  renderToStaticMarkup(<MadeView title="Made here" items={items} state="ready" isOwner={false} {...over} />);

describe('MadeView', () => {
  it('lists each row as a link, its title in its own direction, with the kind and one figure', () => {
    const html = render();
    expect(html).toContain('href="/connections/u/g1"');
    expect(html).toContain('href="/study/d1"');
    expect(html).toContain('href="/builds/my-build"');
    expect(html).toContain('Connections grid · 12 plays');
    expect(html).toContain('Deck · 40 cards');
    expect(html).toContain('Slice It chart · Hard');
    expect(html).toContain('Build · 3 releases');
    // every title is a member's text
    const titles = html.match(/<span dir="auto"[^>]*>[^<]*<\/span>/g) ?? [];
    expect(titles).toHaveLength(items.length);
    expect(html).toContain('>ماء</span>');
  });

  it('is rows on rules: no card or box classes', () => {
    const html = render();
    expect(html).toContain('border-b border-site-border');
    expect(html).not.toMatch(/surface-card|surface-panel|shadow|rounded-site/);
  });

  it('shows a visitor nothing when there is nothing to show', () => {
    expect(render({ items: [] })).toBe('');
  });
  it('shows a visitor nothing while loading and when the request failed', () => {
    expect(render({ items: [], state: 'loading' })).toBe('');
    expect(render({ items: [], state: 'error' })).toBe('');
  });

  it('tells the owner "Nothing published yet" when empty', () => {
    const html = render({ items: [], isOwner: true });
    expect(html).toContain('Nothing published yet');
    expect(html).toContain('Made here');
  });
  it('gives the owner a loading skeleton and an error line', () => {
    expect(render({ items: [], isOwner: true, state: 'loading' })).toContain('aria-busy="true"');
    expect(render({ items: [], isOwner: true, state: 'error' })).toContain('Couldn&#x27;t load this');
  });
  it('shows the owner the list too', () => {
    expect(render({ isOwner: true })).toContain('href="/study/d1"');
  });
});

describe('MadeSettings', () => {
  it('names every kind switch and reflects the ticked kinds', () => {
    const html = renderToStaticMarkup(<MadeSettings kinds={['deck']} onChange={() => {}} />);
    expect(html).toContain('role="group"');
    for (const label of ['Connections grid', 'Lights Out board', 'Deck', 'Slice It chart', 'Build'])
      expect(html).toContain(`aria-label="${label}"`);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html.match(/aria-checked="false"/g)).toHaveLength(4);
  });
});

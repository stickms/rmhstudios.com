import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as null | { user: { id: string } } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o: { defaultValue: string; [k: string]: unknown }) =>
      (o.count === 1 && typeof o.defaultValue_one === 'string' ? o.defaultValue_one : o.defaultValue).replace(
        /\{\{(\w+)\}\}/g,
        (_m, k: string) => String(o[k] ?? ''),
      ),
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, ...rest }: { to: string; params?: { slug: string }; children: ReactNode }) => (
    <a href={params ? to.replace('$slug', params.slug) : to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/session/session-context', () => ({
  useSession: () => ({ data: h.session, isPending: false }),
}));
vi.mock('@/components/ui/prompt-dialog', () => ({ usePrompt: () => () => Promise.resolve(null) }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => () => Promise.resolve(false) }));
vi.mock('@/components/errors/useRefusalText', () => ({
  useRefusalText: () => Object.assign((e: unknown) => String(e), { maybe: (e: unknown) => String(e) }),
}));
vi.mock('@/components/feed/PageLayout', () => ({
  PageLayout: ({ title, children, headerRight }: { title: string; children: ReactNode; headerRight?: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {headerRight}
      {children}
    </main>
  ),
}));
vi.mock('@/components/ui/signed-out-prompt', () => ({
  SignedOutPrompt: ({ callbackURL }: { callbackURL: string }) => <div data-callback={callbackURL} />,
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    children,
    ...rest
  }: {
    value: string;
    children: ReactNode;
    'aria-label'?: string;
    id?: string;
  }) => (
    <select aria-label={rest['aria-label']} id={rest.id} defaultValue={value}>
      {children}
    </select>
  ),
}));

import { ListsPage } from './ListsPage';
import { codePointCount } from './ListItemRow';
import { listsQuery, prefsQuery } from '../../medschools.queries';
import type { MedListDto } from '../../medschools.contract';

const item = (id: string, slug: string, over: Partial<MedListDto['items'][number]> = {}) => ({
  id,
  school: { slug, name: `${slug} School`, shortName: slug, degree: 'MD' as const, state: 'NC', active: true },
  program: 'ANY' as const,
  note: null,
  position: 0,
  ...over,
});
const lists: MedListDto[] = [
  { id: 'b', name: 'Safety', position: 1, items: [item('i3', 'wake')] },
  {
    id: 'a',
    name: 'Reach',
    position: 0,
    items: [
      item('i1', 'duke', { note: 'Visit in March' }),
      item('i2', 'gone', { school: { ...item('x', 'gone').school, active: false } }),
    ],
  },
];

function render(opts: { prefs?: object; lists?: MedListDto[] } = {}): string {
  const qc = new QueryClient();
  qc.setQueryData(listsQuery().queryKey, { lists: opts.lists ?? lists });
  qc.setQueryData(
    prefsQuery().queryKey,
    (opts.prefs ?? {
      programs: ['md-phd'],
      programFilter: 'PHD',
      degree: 'MD',
      homeState: null,
      chartCategories: [],
    }) as never,
  );
  return renderToString(
    <QueryClientProvider client={qc}>
      <ListsPage />
    </QueryClientProvider>,
  );
}

describe('ListsPage', () => {
  it('signed out: the sign-in prompt returns to this page, and nothing else renders', () => {
    h.session = null;
    const html = render();
    expect(html).toContain('data-callback="/rmh-medschool/lists"');
    expect(html).not.toContain('Reach');
  });

  describe('signed in', () => {
    h.session = { user: { id: 'u1' } };
    it('shows the lists as given by the server, with items as rows and a school link', () => {
      h.session = { user: { id: 'u1' } };
      const html = render({ lists: [...lists].sort((x, y) => x.position - y.position) });
      expect(html.indexOf('Reach')).toBeLessThan(html.indexOf('Safety'));
      expect(html).toContain('href="/rmh-medschool/duke"');
      expect(html).toContain('Visit in March');
      expect(html).toContain('2 schools');
      expect(html).toContain('1 school');
    });

    it('an inactive school still lists, as text with a line saying so, and no link', () => {
      h.session = { user: { id: 'u1' } };
      const html = render();
      expect(html).toContain('gone School');
      expect(html).toContain('No longer listed');
      expect(html).not.toContain('href="/rmh-medschool/gone"');
    });

    it('the note field is capped at 500 characters and counted by code point', () => {
      h.session = { user: { id: 'u1' } };
      expect(render()).toContain('maxLength="500"');
      expect(codePointCount('a\u{1F600}b')).toBe(3);
    });

    it('has exactly one primary button, New list, and an Add to my tracker per list', () => {
      h.session = { user: { id: 'u1' } };
      const html = render();
      expect(html.match(/data-variant="primary"/g)).toHaveLength(1);
      expect(html.match(/Add this list to my tracker/g)).toHaveLength(2);
    });

    it('Preferences: the program set (four toggles), home state and the category toggles, at #preferences', () => {
      h.session = { user: { id: 'u1' } };
      const html = render();
      expect(html).toContain('id="preferences"');
      expect(html).toContain('aria-label="Programs"');
      expect(html).toContain('aria-label="Show categories"');
      expect(html).toContain('These fill in a page&#x27;s defaults only when its address does not say otherwise.');
      for (const l of ['>MD<', '>MD-PhD<', '>DO<', '>DO-PhD<']) expect(html).toContain(l);
      // Only the saved program is on.
      const group = html.slice(html.indexOf('aria-label="Programs"'), html.indexOf('Home state'));
      expect(group.match(/aria-pressed="true"/g)).toHaveLength(1);
    });
  });

  it('uses SortableList for reordering and no second drag implementation', () => {
    const src = ['ListsPage.tsx', 'ListSection.tsx', 'ListItemRow.tsx', 'PrefsSection.tsx']
      .map((f) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8'))
      .join('\n');
    expect(src).toContain('SortableList');
    expect(src).not.toMatch(/layoutId|framer-motion|react-dnd|dnd-kit/);
  });
});

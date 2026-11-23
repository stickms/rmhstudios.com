import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as null | { user: { id: string } } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k] ?? '')),
  }),
}));
vi.mock('@/components/session/session-context', () => ({
  useSession: () => ({ data: h.session, isPending: false }),
}));
vi.mock('@/components/ui/prompt-dialog', () => ({ usePrompt: () => () => Promise.resolve(null) }));
vi.mock('@/components/errors/useRefusalText', () => ({
  useRefusalText: () => Object.assign((e: unknown) => String(e), { maybe: (e: unknown) => String(e) }),
}));
// The real menu opens on a click; the markup test needs its rows, so it is always open here.
vi.mock('@/components/ui/anchored-menu', () => ({
  AnchoredMenu: ({ children, label }: { children: ReactNode; label: string }) => (
    <div role="menu" aria-label={label}>
      {children}
    </div>
  ),
}));

import { SaveToList, itemsHolding, listProgramOf } from './SaveToList';
import { listsQuery } from '../medschools.queries';
import type { MedListDto } from '../medschools.contract';

const list = (id: string, name: string, slugs: string[]): MedListDto => ({
  id,
  name,
  position: 0,
  items: slugs.map((slug, i) => ({
    id: `${id}-${i}`,
    school: { slug, name: slug, shortName: slug, degree: 'MD', state: 'NC', active: true },
    program: 'ANY',
    note: null,
    position: i,
  })),
});

function render(lists: MedListDto[] | null): string {
  const qc = new QueryClient();
  if (lists) qc.setQueryData(listsQuery().queryKey, { lists });
  return renderToString(
    <QueryClientProvider client={qc}>
      <SaveToList school={{ slug: 'duke', name: 'Duke University' }} />
    </QueryClientProvider>,
  );
}

describe('SaveToList', () => {
  it('renders nothing signed out', () => {
    h.session = null;
    expect(render([list('a', 'Reach', ['duke'])])).toBe('');
  });

  it('signed in: a named trigger button that keeps the touch floor', () => {
    h.session = { user: { id: 'u1' } };
    const html = render([]);
    expect(html).toContain('aria-label="Save Duke University to a list"');
    expect(html).toContain('<button');
    expect(html).toContain('pointer-coarse:min-h-11');
  });

  it('with two lists, one holding the school: two rows with the check matching, and New list', () => {
    h.session = { user: { id: 'u1' } };
    const html = render([list('a', 'Reach', ['duke']), list('b', 'Safety', ['unc'])]);
    expect(html).toContain('>Reach<');
    expect(html).toContain('>Safety<');
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html.match(/aria-checked="false"/g)).toHaveLength(1);
    expect(html).toContain('>New list<');
    expect(html).not.toContain('>My schools<');
  });

  it('with no list: exactly My schools and New list', () => {
    h.session = { user: { id: 'u1' } };
    const html = render([]);
    expect(html).toContain('>My schools<');
    expect(html).toContain('>New list<');
    expect(html.match(/role="menuitem/g)).toHaveLength(2);
  });

  it('saves with the program in force, either when none', () => {
    expect(listProgramOf('PHD')).toBe('PHD');
    expect(listProgramOf('REG')).toBe('REG');
    expect(listProgramOf('ALL')).toBe('ANY');
    expect(listProgramOf(null)).toBe('ANY');
    expect(itemsHolding(list('a', 'x', ['duke', 'unc']), 'unc')).toHaveLength(1);
  });
});

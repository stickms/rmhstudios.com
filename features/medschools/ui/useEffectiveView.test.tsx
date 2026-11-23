import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  navigated: [] as unknown[],
}));

vi.mock('@/components/session/session-context', () => ({
  useSession: () => ({ data: h.session, isPending: false }),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => (o: unknown) => {
    h.navigated.push(o);
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o: { defaultValue: string }) => o.defaultValue,
  }),
}));

import { useEffectiveView } from './useEffectiveView';
import { PrefsNote } from './PrefsNote';
import { prefsQuery } from '../medschools.queries';
import type { Prefs, PrefsSearch, ViewKind, ViewPatch } from '../engine/prefs';

const PHD_MD: Prefs = { programFilter: 'PHD', degree: 'MD', homeState: null, chartCategories: [] };

function view(
  kind: ViewKind,
  search: PrefsSearch,
  prefs: Prefs | null,
  signedIn = true,
  ctx?: { schoolDegree?: 'MD' | 'DO' },
  patch?: ViewPatch,
) {
  h.session = signedIn ? { user: { id: 'u1' } } : null;
  const qc = new QueryClient();
  if (prefs) qc.setQueryData(prefsQuery().queryKey, prefs);
  let out: ReturnType<typeof useEffectiveView> | undefined;
  function Probe() {
    out = useEffectiveView(kind, search, ctx);
    if (patch) out.setSearch(patch);
    return null;
  }
  renderToString(
    <QueryClientProvider client={qc}>
      <Probe />
    </QueryClientProvider>,
  );
  if (!out) throw new Error('probe did not render');
  return out;
}

describe('useEffectiveView', () => {
  it('no preferences: the view equals the phase 3 view for the same URL', () => {
    expect(view('index', {}, null).view).toEqual({ program: 'ALL', show: expect.any(Array), fromPrefs: false });
    expect(view('index', { degree: 'DO', program: 'PHD' }, null).view).toMatchObject({
      degree: 'DO',
      program: 'PHD',
      fromPrefs: false,
    });
  });

  it('PHD preference and a silent URL: PHD, from preferences', () => {
    expect(view('index', {}, PHD_MD).view).toMatchObject({ degree: 'MD', program: 'PHD', fromPrefs: true });
  });

  it('?program=ALL with a PHD preference is All', () => {
    const v = view('index', { program: 'ALL', degree: 'ALL' }, PHD_MD).view;
    expect(v.program).toBe('ALL');
    expect(v.degree).toBeUndefined();
    expect(v.fromPrefs).toBe(false);
  });

  it('the school kind ignores the degree preference and takes its own', () => {
    const v = view('school', {}, { ...PHD_MD, degree: 'DO' }, true, { schoolDegree: 'MD' }).view;
    expect(v.degree).toBe('MD');
    expect(v.program).toBe('PHD');
  });

  it('signed out, cached preferences are not applied', () => {
    const r = view('index', {}, PHD_MD, false);
    expect(r.view.fromPrefs).toBe(false);
    expect(r.prefs).toBeNull();
  });

  it('setSearch navigates in place with only the changed preference keys rewritten', () => {
    h.navigated.length = 0;
    view('index', {}, PHD_MD, true, undefined, { degree: undefined, program: 'ALL' });
    const nav = h.navigated[0] as { to: string; search: (p: Record<string, unknown>) => unknown; replace: boolean };
    expect(nav.to).toBe('.');
    expect(nav.replace).toBe(true);
    expect(nav.search({ q: 'duke' })).toEqual({ q: 'duke', degree: 'ALL', program: 'ALL' });
  });
});

describe('PrefsNote', () => {
  it('renders the t-meta line and a link only while a default came from preferences', () => {
    const on = renderToString(<PrefsNote fromPrefs />);
    expect(on).toContain('t-meta');
    expect(on).toContain('Filters from your preferences.');
    expect(on).toContain('href="/rmh-medschool/lists#preferences"');
    expect(renderToString(<PrefsNote fromPrefs={false} />)).toBe('');
  });
});

describe('static rules', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  it('every personal query key is under [medschools, me]', () => {
    const q = read('../medschools.queries.ts');
    expect(q).toContain("export const ME_KEY = ['medschools', 'me'] as const");
    for (const m of q.matchAll(/\[\.\.\.ME_KEY, '(\w+)'/g)) expect(m[1]).toBeTruthy();
    expect(q.match(/\[\.\.\.ME_KEY/g)?.length).toBe(3);
  });
  it('the queries file holds no createServerFn', () => {
    expect(read('../medschools.queries.ts')).not.toContain('createServerFn');
  });
  it('the route files import nothing from charts, d3 or zod', () => {
    for (const f of ['index.tsx', 'live.tsx', '$slug.tsx']) {
      const src = readFileSync(new URL(`../../../app/routes/_site/rmh-medschool/${f}`, import.meta.url), 'utf8');
      expect(src).not.toMatch(/ui\/charts|chart-geometry|from 'd3-|from 'zod'/);
    }
  });
});

/**
 * PresetBar server-rendered states (the repo's component tests render to a string): the select
 * with the host's presets, which buttons each selection offers, the full-list state, the reset
 * notice, and nothing for a signed-out member.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { RmhboxPreset } from '@/lib/rmhbox/presets';

const h = vi.hoisted(() => ({
  session: { user: { id: 'u1' } } as { user: { id: string } } | null,
  presets: [] as unknown[],
  sel: { selected: {} as Record<string, string | undefined>, notice: {} as Record<string, boolean>, set: vi.fn() },
  apply: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      String(o?.defaultValue ?? k).replace(/\{\{(\w+)\}\}/g, (_, v) => String(o?.[v] ?? '')),
  }),
}));
vi.mock('@/components/Providers', () => ({ useSession: () => ({ data: h.session }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { presets: h.presets }, isPending: false, isError: false }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/lib/rmhbox/presets.queries', () => ({ PRESETS_KEY: ['rmhbox', 'presets'], presetsQuery: () => ({}) }));
// zustand renders its initial state on the server, so the selection is a plain stub here;
// the real store and the socket emit are covered in presets-apply.product.test.tsx.
vi.mock('../use-presets', () => ({
  usePresetSelection: (pick: (s: typeof h.sel) => unknown) => pick(h.sel),
  useApplyPreset: () => h.apply,
}));
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/contract/client', () => ({ api: vi.fn() }));

const { default: PresetBar } = await import('../PresetBar');

const preset = (n: number, over: Partial<RmhboxPreset> = {}): RmhboxPreset => ({
  id: `p${n}`,
  minigameId: 'rhyme-time',
  name: `Preset ${n}`,
  values: { totalRounds: 2 },
  isDefault: false,
  reset: false,
  updatedAt: '2026-11-21T00:00:00.000Z',
  ...over,
});

const render = () => renderToString(<PresetBar lobbyId="L1" minigameId="rhyme-time" values={{ totalRounds: 3 }} />);

beforeEach(() => {
  h.session = { user: { id: 'u1' } };
  h.presets = [];
  h.sel.selected = {};
  h.sel.notice = {};
});

describe('PresetBar', () => {
  it('renders nothing for a signed-out member', () => {
    h.session = null;
    expect(render()).toBe('');
  });

  it('offers game defaults and Save as preset, but no update, rename or delete without a selection', () => {
    h.presets = [preset(1), preset(2, { isDefault: true })];
    const html = render();
    expect(html).toContain('for="rmhbox-preset-select"');
    // The options live in a closed Radix listbox, so they are not in the server markup.
    expect(html).toContain('Save as preset');
    expect(html).not.toContain('>Update<');
    expect(html).not.toContain('>Delete<');
  });

  it('shows Update, Rename, Use by default and Delete once a preset is selected', () => {
    h.presets = [preset(1)];
    h.sel.selected = { 'rhyme-time': 'p1' };
    const html = render();
    for (const label of ['Update', 'Rename', 'Use by default', 'Delete']) expect(html).toContain(`>${label}<`);
  });

  it('flips the default button for a preset that already is the default', () => {
    h.presets = [preset(1, { isDefault: true })];
    h.sel.selected = { 'rhyme-time': 'p1' };
    expect(render()).toContain('Stop using by default');
  });

  it('disables Save at 10 presets and says why', () => {
    h.presets = Array.from({ length: 10 }, (_, i) => preset(i));
    const html = render();
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Save as preset</);
    expect(html).toContain('You can keep 10 presets per game');
  });

  it('announces the reset notice in a polite live region only after a stale preset was applied', () => {
    h.presets = [preset(1, { reset: true })];
    expect(render()).toMatch(/role="status"[^>]*aria-live="polite"[^>]*><\/p>/);
    h.sel.selected = { 'rhyme-time': 'p1' };
    h.sel.notice = { 'rhyme-time': true };
    expect(render()).toContain('Some settings were reset because the game changed');
  });
});

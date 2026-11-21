/**
 * Applying a preset: the values go over the existing settings socket event (the hub validates
 * them like a manual edit), "Game defaults" uses the reset event, and the default preset is
 * applied once per pick, never again on a refetch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RmhboxPreset } from '@/lib/rmhbox/presets';

const h = vi.hoisted(() => ({ emit: vi.fn(), presets: [] as unknown[], session: { user: { id: 'u1' } } as unknown }));
vi.mock('@/lib/rmhbox/socket', () => ({ emit: h.emit }));
vi.mock('@/components/Providers', () => ({ useSession: () => ({ data: h.session }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: { presets: h.presets } }) }));
vi.mock('@/lib/rmhbox/presets.queries', () => ({ presetsQuery: () => ({}) }));
// Run effects synchronously in a bare render so the auto-apply hook can be driven.
const fx = vi.hoisted(() => ({ run: [] as (() => void)[] }));
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), useEffect: (f: () => void) => fx.run.push(f) }));

const { useApplyPreset, useAutoApplyDefaultPreset, usePresetSelection } = await import('../use-presets');
const { C2S } = await import('@/lib/rmhbox/events');
const { renderToString } = await import('react-dom/server');

const preset = (over: Partial<RmhboxPreset> = {}): RmhboxPreset => ({
  id: 'p1',
  minigameId: 'rhyme-time',
  name: 'Quick round',
  values: { totalRounds: 2 },
  isDefault: false,
  reset: false,
  updatedAt: '2026-11-21T00:00:00.000Z',
  ...over,
});

function probe<T>(hook: () => T): T {
  let out!: T;
  const P = () => {
    out = hook();
    return null;
  };
  renderToString(<P />);
  return out;
}

beforeEach(() => {
  h.emit.mockClear();
  h.presets = [];
  h.session = { user: { id: 'u1' } };
  fx.run = [];
  usePresetSelection.setState({ selected: {}, notice: {}, autoKey: null });
});

describe('useApplyPreset', () => {
  it('sends the values over the settings event and records the selection and the notice', () => {
    const apply = probe(() => useApplyPreset('L1', 'rhyme-time'));
    apply(preset({ reset: true }));
    expect(h.emit).toHaveBeenCalledWith(C2S.GAME_UPDATE_SETTINGS, { lobbyId: 'L1', settings: { totalRounds: 2 } });
    expect(usePresetSelection.getState().selected['rhyme-time']).toBe('p1');
    expect(usePresetSelection.getState().notice['rhyme-time']).toBe(true);
  });

  it('resets to the game defaults over the reset event', () => {
    const apply = probe(() => useApplyPreset('L1', 'rhyme-time'));
    apply(preset());
    apply(null);
    expect(h.emit).toHaveBeenLastCalledWith(C2S.GAME_RESET_SETTINGS, { lobbyId: 'L1' });
    expect(usePresetSelection.getState().selected['rhyme-time']).toBeUndefined();
  });

  it('does nothing outside a lobby', () => {
    probe(() => useApplyPreset('', 'rhyme-time'))(preset());
    expect(h.emit).not.toHaveBeenCalled();
  });
});

describe('useAutoApplyDefaultPreset', () => {
  const mount = (enabled = true) => {
    fx.run = [];
    probe(() => useAutoApplyDefaultPreset('L1', 'rhyme-time', enabled));
    fx.run.forEach((f) => f());
  };

  it('applies the default for a pick and records the pick so a refetch does not apply it again', () => {
    h.presets = [preset({ isDefault: true })];
    mount();
    expect(h.emit).toHaveBeenCalledTimes(1);
    expect(h.emit).toHaveBeenCalledWith(C2S.GAME_UPDATE_SETTINGS, { lobbyId: 'L1', settings: { totalRounds: 2 } });
    expect(usePresetSelection.getState().autoKey).toBe('L1:rhyme-time');
  });

  it('clears a stale selection when the pick has no default', () => {
    usePresetSelection.setState({ selected: { 'rhyme-time': 'old' } });
    h.presets = [preset()];
    mount();
    expect(usePresetSelection.getState().selected['rhyme-time']).toBeUndefined();
  });

  it('applies nothing for a non-host and nothing when no preset is the default', () => {
    h.presets = [preset({ isDefault: true })];
    mount(false);
    expect(h.emit).not.toHaveBeenCalled();
    h.presets = [preset()];
    mount();
    expect(h.emit).not.toHaveBeenCalled();
  });
});

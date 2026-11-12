import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.fn();
vi.mock('@/lib/contract/client', () => ({ api: (...args: unknown[]) => api(...args) }));

type Mod = typeof import('./live-session');

const ALICE = { user: { id: 'u1', name: 'Alice' }, session: { token: 't' } };

/** Just enough of `window` / `document` for the store's listeners. */
function fakeBrowser() {
  const handlers = new Map<string, Set<(event: unknown) => void>>();
  const target = {
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)?.add(fn);
    },
    removeEventListener: (type: string, fn: (event: unknown) => void) => {
      handlers.get(type)?.delete(fn);
    },
  };
  const doc = { ...target, visibilityState: 'visible' };
  vi.stubGlobal('window', target);
  vi.stubGlobal('document', doc);
  return {
    fire: (type: string, event: unknown = {}) => {
      for (const fn of handlers.get(type) ?? []) fn(event);
    },
    count: () => [...handlers.values()].reduce((n, set) => n + set.size, 0),
  };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('lib/session/live-session', () => {
  let mod: Mod;
  let browser: ReturnType<typeof fakeBrowser>;

  beforeEach(async () => {
    vi.resetModules();
    api.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    browser = fakeBrowser();
    mod = await import('./live-session');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is pending until asked, then holds what the session endpoint said', async () => {
    api.mockResolvedValue(ALICE);
    const seen = vi.fn();
    mod.subscribeLiveSession(seen);
    expect(mod.getLiveSession()).toBe(mod.getPendingSession());
    expect(mod.getLiveSession().isPending).toBe(true);

    mod.startLiveSession();
    await flush();
    expect(api).toHaveBeenCalledTimes(1);
    expect(mod.getLiveSession()).toMatchObject({ data: ALICE, isPending: false, error: null });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('reports signed out when the endpoint answers null', async () => {
    api.mockResolvedValue(null);
    mod.startLiveSession();
    await flush();
    expect(mod.getLiveSession()).toMatchObject({ data: null, isPending: false });
  });

  it('keeps the known session when a later request fails', async () => {
    api.mockResolvedValueOnce(ALICE).mockRejectedValueOnce(new Error('offline'));
    mod.startLiveSession();
    await flush();
    await mod.getLiveSession().refetch();
    expect(api).toHaveBeenCalledTimes(2);
    expect(mod.getLiveSession().data).toEqual(ALICE);
    expect(mod.getLiveSession().error).toBeInstanceOf(Error);
  });

  it('refetches when the tab comes back or the connection returns, at most once in five seconds', async () => {
    api.mockResolvedValue(ALICE);
    mod.startLiveSession();
    await flush();

    vi.setSystemTime(1_000_000 + 4_000);
    browser.fire('visibilitychange');
    browser.fire('online');
    expect(api).toHaveBeenCalledTimes(1);

    vi.setSystemTime(1_000_000 + 5_000);
    browser.fire('visibilitychange');
    await flush();
    expect(api).toHaveBeenCalledTimes(2);

    vi.setSystemTime(1_000_000 + 11_000);
    browser.fire('online');
    await flush();
    expect(api).toHaveBeenCalledTimes(3);
  });

  it('does not refetch for a tab that is being hidden', async () => {
    api.mockResolvedValue(ALICE);
    mod.startLiveSession();
    await flush();
    vi.setSystemTime(1_000_000 + 60_000);
    (document as unknown as { visibilityState: string }).visibilityState = 'hidden';
    browser.fire('visibilitychange');
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("refetches at once on another tab's session broadcast, and only on that", async () => {
    api.mockResolvedValueOnce(ALICE).mockResolvedValueOnce(null);
    mod.startLiveSession();
    await flush();

    browser.fire('storage', { key: 'rmh-style', newValue: 'graphite' });
    browser.fire('storage', { key: 'better-auth.message', newValue: 'not json' });
    browser.fire('storage', { key: 'better-auth.message', newValue: '{"event":"other","data":{}}' });
    expect(api).toHaveBeenCalledTimes(1);

    browser.fire('storage', {
      key: 'better-auth.message',
      newValue: '{"event":"session","data":{"trigger":"signout"}}',
    });
    await flush();
    expect(api).toHaveBeenCalledTimes(2);
    expect(mod.getLiveSession().data).toBeNull();
  });

  it('asks again at once when the auth client reports a change, and the newer answer wins', async () => {
    const answers: Array<(value: unknown) => void> = [];
    api.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    mod.startLiveSession();
    expect(api).toHaveBeenCalledTimes(1);

    // A sign-in lands while the first (signed-out) answer is still on its way.
    mod.refreshLiveSession();
    expect(api).toHaveBeenCalledTimes(2);
    answers[1]?.(ALICE);
    await flush();
    answers[0]?.(null);
    await flush();
    expect(mod.getLiveSession()).toMatchObject({ data: ALICE, isPending: false });
  });

  it('shares a request already on its way between ordinary callers', async () => {
    let answer: (value: unknown) => void = () => {};
    api.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    mod.startLiveSession();
    const again = mod.getLiveSession().refetch();
    expect(api).toHaveBeenCalledTimes(1);
    answer(ALICE);
    await again;
    expect(mod.getLiveSession().data).toEqual(ALICE);
  });

  it('listens once, and stops when asked', () => {
    api.mockResolvedValue(null);
    const stop = mod.startLiveSession();
    mod.startLiveSession();
    expect(browser.count()).toBe(3);
    expect(api).toHaveBeenCalledTimes(1);
    stop();
    expect(browser.count()).toBe(0);
  });
});

describe('readSession', () => {
  it('answers the session, or null when the request fails', async () => {
    vi.resetModules();
    const mod = await import('./live-session');
    api.mockReset();
    api.mockResolvedValueOnce(ALICE).mockRejectedValueOnce(new Error('offline'));
    expect(await mod.readSession()).toEqual(ALICE);
    expect(await mod.readSession()).toBeNull();
  });
});

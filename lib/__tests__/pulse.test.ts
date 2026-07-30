import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * `lib/pulse.ts` is the single background timer for a signed-in tab: it replaced
 * four independent pollers, so a regression here silently either stops refreshing
 * the nav badge / friends surfaces or starts making more requests than the
 * endpoints it consolidated. The behaviours worth pinning:
 *
 *  - the request asks only for sections that have a live subscriber (that is what
 *    keeps a phone from paying for the follow-graph fan-out);
 *  - concurrent triggers share one request, but a subscriber that mounts mid-flight
 *    and adds a NEW section still gets a request for it rather than waiting a full
 *    interval;
 *  - a section the server omitted keeps its previous value (absent ≠ empty);
 *  - the last unsubscribe tears the timer down and a response that raced teardown
 *    cannot repopulate the cache.
 */

const ORIGINAL_FETCH = globalThis.fetch;

/** Bodies each successive fetch should resolve with, plus the recorded requests. */
let queue: unknown[];
let sent: Array<{ want: string[] }>;
/** Resolvers for tests that need to hold a request open. */
let gate: (() => void) | null;

function installFetch() {
  globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body ?? '{}')));
    if (gate) await new Promise<void>((r) => (gate = r));
    const body = queue.shift() ?? { ok: true };
    return { ok: true, json: async () => body } as Response;
  }) as unknown as typeof fetch;
}

/**
 * The module holds process-wide state, so each test needs a clean copy. Also
 * stubs the document/window listeners `start()` binds.
 */
async function freshModule() {
  vi.resetModules();
  return import('../pulse');
}

beforeEach(() => {
  queue = [];
  sent = [];
  gate = null;
  installFetch();
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pulse section demand', () => {
  it('asks only for sections that have a subscriber', async () => {
    const { subscribePulse } = await freshModule();
    queue.push({ ok: true, notifications: 4 });

    const stop = subscribePulse(['notifications'], () => {});
    await vi.waitFor(() => expect(sent.length).toBe(1));

    expect(sent[0].want).toEqual(['notifications']);
    stop();
  });

  it('requests nothing but the heartbeat for a subscriber with no sections', async () => {
    const { subscribePulse } = await freshModule();
    const stop = subscribePulse([], () => {});
    await vi.waitFor(() => expect(sent.length).toBe(1));

    expect(sent[0].want).toEqual([]);
    stop();
  });

  it('drops a section once its last consumer leaves', async () => {
    const { subscribePulse, requestPulse } = await freshModule();
    const keep = subscribePulse(['notifications'], () => {});
    const drop = subscribePulse(['friends'], () => {});
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0));

    drop();
    sent.length = 0;
    await requestPulse();

    expect(sent[0].want).toEqual(['notifications']);
    keep();
  });

  it('keeps a section while a second consumer still wants it', async () => {
    const { subscribePulse, requestPulse } = await freshModule();
    const a = subscribePulse(['friends'], () => {});
    const b = subscribePulse(['friends'], () => {});
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0));

    a();
    sent.length = 0;
    await requestPulse();

    expect(sent[0].want).toEqual(['friends']);
    b();
  });
});

describe('pulse request sharing', () => {
  it('shares one request between concurrent triggers', async () => {
    const { subscribePulse, requestPulse } = await freshModule();
    const stop = subscribePulse(['notifications'], () => {});
    await vi.waitFor(() => expect(sent.length).toBe(1));

    sent.length = 0;
    await Promise.all([requestPulse(), requestPulse(), requestPulse()]);

    expect(sent.length).toBe(1);
    stop();
  });

  it('does not make a mid-flight subscriber wait for the next interval', async () => {
    const { subscribePulse } = await freshModule();

    // Hold the first request open, then mount a consumer for a section that
    // request never asked for.
    gate = () => {};
    const first = subscribePulse(['notifications'], () => {});
    await vi.waitFor(() => expect(sent.length).toBe(1));

    const second = subscribePulse(['friends'], () => {});
    gate?.();
    gate = null;

    // The follow-up covers both sections rather than only the newly added one.
    await vi.waitFor(() => expect(sent.length).toBe(2));
    expect(sent[1].want).toContain('friends');
    expect(sent[1].want).toContain('notifications');

    first();
    second();
  });
});

describe('pulse payload handling', () => {
  it('fans a new count out to subscribers', async () => {
    const { subscribePulse } = await freshModule();
    queue.push({ ok: true, notifications: 7 });
    const seen: number[] = [];

    const stop = subscribePulse(['notifications'], (d) => seen.push(d.notifications));
    await vi.waitFor(() => expect(seen).toContain(7));
    stop();
  });

  it('keeps the previous value for a section the response omitted', async () => {
    const { subscribePulse, requestPulse, pulseSnapshot } = await freshModule();
    queue.push({ ok: true, notifications: 3 });

    const stop = subscribePulse(['notifications'], () => {});
    await vi.waitFor(() => expect(pulseSnapshot().notifications).toBe(3));

    // A section that failed server-side is absent — that must not read as zero.
    queue.push({ ok: true });
    await requestPulse();

    expect(pulseSnapshot().notifications).toBe(3);
    stop();
  });

  it('resets cached values when the last subscriber leaves', async () => {
    const { subscribePulse, pulseSnapshot } = await freshModule();
    queue.push({ ok: true, notifications: 5, friends: [{ id: 'a' }] });

    const stop = subscribePulse(['notifications', 'friends'], () => {});
    await vi.waitFor(() => expect(pulseSnapshot().notifications).toBe(5));

    stop();

    expect(pulseSnapshot().notifications).toBe(0);
    expect(pulseSnapshot().friends).toBeNull();
  });

  it('ignores a response that lands after teardown', async () => {
    const { subscribePulse, pulseSnapshot } = await freshModule();

    gate = () => {};
    queue.push({ ok: true, notifications: 9 });
    const stop = subscribePulse(['notifications'], () => {});
    await vi.waitFor(() => expect(sent.length).toBe(1));

    // Last subscriber leaves while the request is still out, then it resolves.
    stop();
    gate?.();
    gate = null;
    await Promise.resolve();
    await Promise.resolve();

    expect(pulseSnapshot().notifications).toBe(0);
  });

  it('setPulseNotifications updates subscribers without a request', async () => {
    const { subscribePulse, setPulseNotifications } = await freshModule();
    queue.push({ ok: true, notifications: 5 });
    const seen: number[] = [];
    const stop = subscribePulse(['notifications'], (d) => seen.push(d.notifications));
    await vi.waitFor(() => expect(seen).toContain(5));

    // Reading the inbox clears the badge optimistically — it must not wait for
    // the next pulse, and it must not cost a request.
    sent.length = 0;
    setPulseNotifications(0);

    expect(seen.at(-1)).toBe(0);
    expect(sent.length).toBe(0);
    stop();
  });
});

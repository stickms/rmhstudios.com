/**
 * S14-16: a self-exclusion saved in one tab reaches the member's other open tabs through a `BroadcastChannel`
 * (`rmh-play-limits`). The hook listens once per tab while signed in, reference-counted; it runs no timer; a browser
 * without the API keeps the stale-time fallback and throws nothing.
 *
 * The suite runs in `node`: React's `useEffect` is a collector the test runs by hand, the session and the query
 * client are fakes, and `BroadcastChannel` is an in-memory bus between channel objects of the same name.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  signedIn: true,
  effects: [] as Array<() => void | (() => void)>,
  setQueryData: vi.fn(),
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: (fn: () => void | (() => void)) => {
    h.effects.push(fn);
  },
}));
vi.mock('@/components/session/session-context', () => ({
  useSession: () => ({ data: h.signedIn ? { user: { id: 'u1' } } : null }),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ setQueryData: h.setQueryData }),
  useQuery: () => ({ data: undefined }),
}));

import {
  PLAY_LIMITS_CHANNEL,
  announceRiskSurfaces,
  listenForRiskSurfaces,
  riskSurfacesQuery,
  useRiskSurfacesHidden,
} from '../useRiskSurfacesHidden';

/** Channel objects of one name; a message reaches every other open object of that name, never the sender. */
const open = new Set<FakeChannel>();
class FakeChannel {
  static created: FakeChannel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  closed = false;
  posted: unknown[] = [];
  constructor(readonly name: string) {
    FakeChannel.created.push(this);
    open.add(this);
  }
  postMessage(data: unknown) {
    this.posted.push(data);
    for (const other of open)
      if (other !== this && other.name === this.name) other.onmessage?.({ data } as MessageEvent);
  }
  close() {
    this.closed = true;
    open.delete(this);
  }
}

/** Mount the hook once: run what it asked `useEffect` to do, return its cleanup. */
function useMounted(): () => void {
  h.effects.length = 0;
  useRiskSurfacesHidden();
  const cleanups = h.effects.map((fn) => fn()).filter((c): c is () => void => typeof c === 'function');
  return () => cleanups.forEach((c) => c());
}

beforeEach(() => {
  h.signedIn = true;
  h.setQueryData.mockClear();
  FakeChannel.created = [];
  open.clear();
  vi.stubGlobal('BroadcastChannel', FakeChannel);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('risk-surfaces broadcast', () => {
  it('posts the saved answer for the other tabs and sets the cache entry in a tab that hears it', () => {
    const unmount = useMounted();
    expect(FakeChannel.created).toHaveLength(1);
    expect(FakeChannel.created[0]!.name).toBe(PLAY_LIMITS_CHANNEL);

    // another tab of the same browser saves the setting
    const otherTab = new FakeChannel(PLAY_LIMITS_CHANNEL);
    otherTab.postMessage({ hidden: true });
    expect(h.setQueryData).toHaveBeenCalledWith(riskSurfacesQuery().queryKey, { hidden: true });
    otherTab.postMessage({ hidden: false });
    expect(h.setQueryData).toHaveBeenLastCalledWith(riskSurfacesQuery().queryKey, { hidden: false });
    unmount();
  });

  it('announces through the tab’s own open channel, or a short-lived one when none is open', () => {
    const otherTab = new FakeChannel(PLAY_LIMITS_CHANNEL);
    const heard: unknown[] = [];
    otherTab.onmessage = (e) => heard.push(e.data);

    announceRiskSurfaces(true); // no listener open in this tab: one is opened, used, closed
    const temp = FakeChannel.created.at(-1)!;
    expect(temp).not.toBe(otherTab);
    expect(temp.posted).toEqual([{ hidden: true }]);
    expect(temp.closed).toBe(true);

    const unmount = useMounted();
    announceRiskSurfaces(false); // the hook's shared channel carries it
    expect(FakeChannel.created).toHaveLength(3);
    expect(heard).toEqual([{ hidden: true }, { hidden: false }]);
    unmount();
  });

  it('ignores a message that is not { hidden: boolean }', () => {
    const unmount = useMounted();
    const otherTab = new FakeChannel(PLAY_LIMITS_CHANNEL);
    for (const bad of [null, 'x', 1, {}, { hidden: 'yes' }, { hidden: 1 }]) otherTab.postMessage(bad);
    expect(h.setQueryData).not.toHaveBeenCalled();
    unmount();
  });

  it('does nothing when there is no BroadcastChannel, and throws nothing', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    expect(() => {
      const unmount = useMounted();
      announceRiskSurfaces(true);
      unmount();
    }).not.toThrow();
    expect(FakeChannel.created).toHaveLength(0);
  });

  it('survives a constructor or post that throws', () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new Error('blocked');
        }
      },
    );
    expect(() => {
      const unmount = useMounted();
      announceRiskSurfaces(true);
      unmount();
    }).not.toThrow();
  });

  it('opens no channel when signed out', () => {
    h.signedIn = false;
    const unmount = useMounted();
    expect(FakeChannel.created).toHaveLength(0);
    unmount();
  });

  it('shares one channel across users of the hook and closes it with the last unmount', () => {
    const a = useMounted();
    const b = useMounted();
    expect(FakeChannel.created).toHaveLength(1);
    const channel = FakeChannel.created[0]!;
    a();
    expect(channel.closed).toBe(false);
    b();
    expect(channel.closed).toBe(true);
    // a later user opens a fresh one
    const c = useMounted();
    expect(FakeChannel.created).toHaveLength(2);
    c();
  });

  it('stops a released listener from hearing later messages', () => {
    const heard: boolean[] = [];
    const release = listenForRiskSurfaces((hidden) => heard.push(hidden));
    const other = new FakeChannel(PLAY_LIMITS_CHANNEL);
    other.postMessage({ hidden: true });
    release();
    other.postMessage({ hidden: false });
    expect(heard).toEqual([true]);
  });

  it('schedules no timer, interval or frame', () => {
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    const interval = vi.spyOn(globalThis, 'setInterval');
    // The suite runs in node, which has no frame scheduler: stub one so a frame request would be seen.
    const frame = vi.fn(() => 0);
    vi.stubGlobal('requestAnimationFrame', frame);
    const unmount = useMounted();
    new FakeChannel(PLAY_LIMITS_CHANNEL).postMessage({ hidden: true });
    announceRiskSurfaces(false);
    unmount();
    expect(timeout).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expect(frame).not.toHaveBeenCalled();
  });
});

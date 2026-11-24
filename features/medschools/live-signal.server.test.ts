import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LIVE_SIGNAL_COALESCE_MS,
  LIVE_SIGNAL_KEY,
  createLiveSignalPublisher,
  newestOf,
  signalNewLiveEvents,
  subscribeLiveSignal,
} from './live-signal.server';

afterEach(() => {
  vi.useRealTimers();
});

const recent = () => new Date(Date.now() - 60_000);

describe('the medschools live signal publisher', () => {
  it('sends the first signal at once and coalesces a burst into one trailing signal per window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T12:00:00Z'));
    const publish = vi.fn();
    const p = createLiveSignalPublisher(() => ({ publish }));

    p.notify(recent());
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenLastCalledWith(LIVE_SIGNAL_KEY, { at: '2026-11-24T12:00:00.000Z' });

    // Ten more commits inside the window: nothing until the window ends, then exactly one.
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(300);
      p.notify(recent());
    }
    expect(publish).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(LIVE_SIGNAL_COALESCE_MS);
    expect(publish).toHaveBeenCalledTimes(2);

    // Quiet afterwards: nothing more is sent.
    vi.advanceTimersByTime(LIVE_SIGNAL_COALESCE_MS * 4);
    expect(publish).toHaveBeenCalledTimes(2);

    // A commit after a quiet window goes out immediately again.
    p.notify(recent());
    expect(publish).toHaveBeenCalledTimes(3);
    p.dispose();
  });

  it('carries nothing but the time', () => {
    const publish = vi.fn();
    createLiveSignalPublisher(() => ({ publish })).notify(recent());
    const payload = publish.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(['at']);
    expect(typeof payload.at).toBe('string');
  });

  it('sends nothing when no event was created, or only old (backfilled) ones', () => {
    const publish = vi.fn();
    const p = createLiveSignalPublisher(() => ({ publish }));
    p.notify(null);
    p.notify(undefined);
    p.notify(new Date(Date.now() - 30 * 86_400_000));
    expect(publish).not.toHaveBeenCalled();
  });

  it('is a no-op without a bus and never throws when the bus does', () => {
    expect(() => createLiveSignalPublisher(() => null).notify(recent())).not.toThrow();
    const throwing = createLiveSignalPublisher(() => ({
      publish: () => {
        throw new Error('redis down');
      },
    }));
    expect(() => throwing.notify(recent())).not.toThrow();
    expect(() =>
      createLiveSignalPublisher(() => {
        throw new Error('no bus');
      }).notify(recent()),
    ).not.toThrow();
  });

  it('reaches an in-process subscriber through the real bus when Redis is not configured', () => {
    expect(process.env.REDIS_URL).toBeUndefined();
    const got: unknown[] = [];
    const off = subscribeLiveSignal((s) => got.push(s));
    expect(() => signalNewLiveEvents(recent())).not.toThrow();
    off();
    expect(got).toHaveLength(1);
  });

  it('newestOf picks the latest date', () => {
    expect(newestOf([])).toBeNull();
    expect(newestOf([null, new Date(1), undefined, new Date(5), new Date(3)])?.getTime()).toBe(5);
  });
});

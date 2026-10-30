import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startHeartbeatLoop } from '@/lib/playtime/heartbeat-loop';

describe('startHeartbeatLoop', () => {
  let visible: boolean;
  const send = vi.fn();
  const start = () =>
    startHeartbeatLoop({ gameId: 'altair', send, isVisible: () => visible, now: () => Date.now() });

  beforeEach(() => {
    vi.useFakeTimers();
    visible = true;
    send.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('sends nothing on mount: a bounce credits nothing', () => {
    start();
    vi.advanceTimersByTime(29_999);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends the first beat 30 s after mount, then one every 30 s', () => {
    start();
    vi.advanceTimersByTime(30_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('altair');
    vi.advanceTimersByTime(60_000);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('skips beats while the tab is hidden and resumes when visible again', () => {
    start();
    visible = false;
    vi.advanceTimersByTime(90_000);
    expect(send).not.toHaveBeenCalled();
    visible = true;
    vi.advanceTimersByTime(30_000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('stops beating after 5 minutes without input and resumes on input', () => {
    const loop = start();
    vi.advanceTimersByTime(5 * 60_000); // beats at 30..300 s: 10 beats
    expect(send).toHaveBeenCalledTimes(10);
    vi.advanceTimersByTime(30_000); // 330 s since input: idle
    expect(send).toHaveBeenCalledTimes(10);
    loop.noteInput();
    vi.advanceTimersByTime(30_000);
    expect(send).toHaveBeenCalledTimes(11);
  });

  it('stop() ends the loop for good', () => {
    const loop = start();
    loop.stop();
    vi.advanceTimersByTime(10 * 60_000);
    expect(send).not.toHaveBeenCalled();
  });
});

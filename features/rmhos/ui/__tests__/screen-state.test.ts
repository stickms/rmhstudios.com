import { describe, expect, it } from 'vitest';
import { screenInteractive } from '../screen-state';

describe('screenInteractive', () => {
  it.each([
    ['running, desktop up, no overlay', 'running', true, false, true],
    ['running but the desktop is not ready', 'running', false, false, false],
    ['running under a signed-out panel', 'running', true, true, false],
    ['downloading', 'downloading', false, true, false],
    ['booting', 'booting', false, true, false],
    ['signing in', 'session', false, true, false],
    ['failed', 'failed', false, true, false],
    ['stopped', 'stopped', false, true, false],
    ['idle', 'idle', false, false, false],
    ['a stale desktopReady after a failure', 'failed', true, true, false],
  ] as const)('%s', (_n, phase, desktopReady, overlay, want) => {
    expect(screenInteractive({ phase, desktopReady, overlay })).toBe(want);
  });
});

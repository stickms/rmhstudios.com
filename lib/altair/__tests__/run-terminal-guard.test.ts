// Run coins are what the server's solo verifier pays out, so the end of a run must pay its completion
// bonus exactly once: victory() and die() are terminal until the next startRun.
import { describe, it, expect, beforeEach } from 'vitest';
import { useAltairGameStore } from '../stores/game-store';

const store = () => useAltairGameStore.getState();

describe('altair run: terminal phases', () => {
  beforeEach(() => {
    store().startRun('warrior', false, {}, 0, 0, 0, false);
  });

  it('a repeated victory pays the completion bonus once', () => {
    const before = store().coins;
    store().victory();
    store().victory();
    expect(store().phase).toBe('victory');
    expect(store().coins - before).toBe(150);
    expect(store().coinBreakdown.completionBonus).toBe(150);
  });

  it('victory after death pays nothing and stays dead', () => {
    const before = store().coins;
    store().die();
    store().victory();
    expect(store().phase).toBe('dead');
    expect(store().coins).toBe(before);
  });
});

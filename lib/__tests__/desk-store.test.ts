import { describe, it, expect, beforeEach } from 'vitest';
import { useDeskStore } from '../daily-puzzles/desk-store';

describe('useDeskStore', () => {
  beforeEach(() => useDeskStore.getState().setFocusedMode(null));

  it('defaults to no focused mode', () => {
    expect(useDeskStore.getState().focusedMode).toBeNull();
  });

  it('sets and clears the focused mode', () => {
    useDeskStore.getState().setFocusedMode('spectrum');
    expect(useDeskStore.getState().focusedMode).toBe('spectrum');
    useDeskStore.getState().setFocusedMode(null);
    expect(useDeskStore.getState().focusedMode).toBeNull();
  });
});

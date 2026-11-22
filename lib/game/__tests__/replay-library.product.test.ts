import { describe, expect, it } from 'vitest';
import { allowedActions, replayGameTitle, replayKind, visibilityChangeRefusal } from '@/lib/game/replay-library';

describe('replay kind', () => {
  it('is a speedrun proof whenever a speedrun entry points at it, even a ghost game', () => {
    expect(replayKind('lights-out', true)).toBe('speedrun');
    expect(replayKind('neon-driftway', true)).toBe('speedrun');
  });
  it('is a ghost for a race-ghost game and a run otherwise', () => {
    expect(replayKind('neon-driftway', false)).toBe('ghost');
    expect(replayKind('lights-out', false)).toBe('run');
  });
});

describe('allowed actions per row kind', () => {
  it('lets an ordinary run change visibility and be deleted', () => {
    expect(allowedActions('run')).toEqual({ canChangeVisibility: true, canDelete: true, lock: null });
  });
  it('locks a speedrun proof completely', () => {
    expect(allowedActions('speedrun')).toEqual({ canChangeVisibility: false, canDelete: false, lock: 'speedrun' });
  });
  it('keeps a ghost unlisted but deletable', () => {
    expect(allowedActions('ghost')).toEqual({ canChangeVisibility: false, canDelete: true, lock: 'ghost' });
  });
});

describe('visibility change refusal', () => {
  it('refuses every change to a speedrun proof', () => {
    expect(visibilityChangeRefusal('speedrun', 'unlisted')).toBe('speedrun');
    expect(visibilityChangeRefusal('speedrun', 'public')).toBe('speedrun');
  });
  it('refuses only publishing a ghost', () => {
    expect(visibilityChangeRefusal('ghost', 'public')).toBe('ghost');
    expect(visibilityChangeRefusal('ghost', 'unlisted')).toBeNull();
  });
  it('allows either change to a run', () => {
    expect(visibilityChangeRefusal('run', 'public')).toBeNull();
    expect(visibilityChangeRefusal('run', 'unlisted')).toBeNull();
  });
});

describe('game titles', () => {
  it('falls back to the replay table’s name, then the id', () => {
    expect(replayGameTitle('daily-puzzle')).not.toBe('');
    expect(replayGameTitle('not-a-game')).toBe('not-a-game');
  });
});

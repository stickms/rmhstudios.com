/**
 * Undercover Editor — who edited which story stays hidden from players until
 * REVEAL, now that snapshots carry the reading and reveal state for players
 * who reconnect: docs/testing.md criterion 3, private state leaking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_USERS, createMockContext } from '../../../../../testing/rmhbox/phase-6/setup';
import type { MockContextData } from '../../../../../testing/rmhbox/phase-6/setup';
import { UndercoverEditorGame } from '..';
import { UE_WRITE_TIMEOUT_SECONDS, UE_EDIT_TIMEOUT_SECONDS } from '../../../../../lib/rmhbox/constants';

const users = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
const host = MOCK_USERS.alice.userId;

type GameInternals = {
  phase: string;
  editorAssignments: Map<string, string>;
  stories: Map<
    string,
    {
      editorUserId: string;
    }
  >;
  readingStoryIndex: number;
  readingSentenceIndex: number;
};

function internals(game: UndercoverEditorGame): GameInternals {
  return (
    game as unknown as {
      state: GameInternals;
    }
  ).state;
}

describe('Undercover Editor — story reveals stay private until REVEAL', () => {
  let ctx: MockContextData;
  let game: UndercoverEditorGame;

  /** Run every WRITE/EDIT round out on its timers, landing in READING. */
  function toReading() {
    vi.advanceTimersByTime(users.length * (UE_WRITE_TIMEOUT_SECONDS + UE_EDIT_TIMEOUT_SECONDS) * 1000 + 100);
    expect(internals(game).phase).toBe('READING');
  }

  function toReview() {
    toReading();
    for (let i = 0; i < users.length; i++) game.handleInput(host, 'NEXT_STORY', {});
    expect(internals(game).phase).toBe('REVIEW');
  }

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createMockContext(users);
    game = new UndercoverEditorGame(ctx.context);
    game.start();
  });

  afterEach(() => {
    game.cleanup();
    vi.useRealTimers();
  });

  it('never sends story reveals to a player before REVEAL', () => {
    toReview();
    const snap = game.getStateForPlayer(MOCK_USERS.bob.userId) as Record<string, unknown>;
    expect(snap.storyReveals).toBeUndefined();
    expect(snap.matchResults).toBeUndefined();
  });
});

/**
 * Undercover Agent — the key card (which tiles are whose agents) only ever
 * reaches a spymaster, including the operative promoted when a spymaster
 * drops: docs/testing.md criterion 3, one player's private state leaking to
 * another.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_USERS, createMockContext } from '../../../../../testing/rmhbox/phase-6/setup';
import type { MockContextData } from '../../../../../testing/rmhbox/phase-6/setup';
import { UndercoverAgentMinigame } from '..';
import { UndercoverAgentPhase } from '../types';
import type { UndercoverAgentState } from '../types';
import { UA_SETUP_DURATION } from '../../../../../lib/rmhbox/constants';
import { UA_SPYMASTER_RECONNECT_GRACE_SECONDS } from '../../../../../lib/rmhbox/undercover-agent/schemas';

const users = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
const host = MOCK_USERS.alice.userId;

function state(game: UndercoverAgentMinigame): UndercoverAgentState {
  return (
    game as unknown as {
      state: UndercoverAgentState;
    }
  ).state;
}

function actions(ctx: MockContextData, type: string): Array<Record<string, unknown>> {
  return ctx.broadcastLog
    .filter((e) => e.event === 'rmhbox:game:action')
    .map((e) => e.data as Record<string, unknown>)
    .filter((d) => d.type === type);
}

function privateActions(ctx: MockContextData, type: string) {
  return ctx.playerLog.filter(
    (e) =>
      (
        e.data as {
          type?: string;
        }
      ).type === type,
  );
}

function setConnected(ctx: MockContextData, userId: string, connected: boolean) {
  ctx.context.players.get(userId)!.isConnected = connected;
}

describe('Undercover Agent — the key card reaches spymasters only', () => {
  let ctx: MockContextData;
  let game: UndercoverAgentMinigame;

  function startPlaying() {
    game.handleInput(host, 'START_GAME', {});
    expect(state(game).phase).toBe(UndercoverAgentPhase.SETUP);
    vi.advanceTimersByTime(UA_SETUP_DURATION * 1000);
    expect(state(game).phase).toBe(UndercoverAgentPhase.CLUE);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createMockContext(users);
    game = new UndercoverAgentMinigame(ctx.context);
    game.start();
  });

  afterEach(() => {
    game.cleanup();
    vi.useRealTimers();
  });

  it('a spymaster who disconnects is replaced; the key card goes ONLY to the successor (keep)', () => {
    startPlaying();
    const red = state(game).teams.red;
    const oldSpymaster = red.spymasterId;
    const successor = red.operativeIds[0]!;
    const keyCardsBefore = privateActions(ctx, 'UA_KEY_CARD').length;

    setConnected(ctx, oldSpymaster, false);
    game.handlePlayerDisconnect(oldSpymaster);
    // Still inside the reconnect window: no change yet.
    vi.advanceTimersByTime(UA_SPYMASTER_RECONNECT_GRACE_SECONDS * 1000 - 1);
    expect(state(game).teams.red.spymasterId).toBe(oldSpymaster);

    vi.advanceTimersByTime(1);
    expect(state(game).teams.red.spymasterId).toBe(successor);
    expect(state(game).teams.red.operativeIds).toContain(oldSpymaster);
    expect(actions(ctx, 'UA_ROLES_CHANGED').at(-1)).toMatchObject({
      teamId: 'red',
      spymasterId: successor,
    });

    const newKeyCards = privateActions(ctx, 'UA_KEY_CARD').slice(keyCardsBefore);
    expect(newKeyCards.map((e) => e.userId)).toEqual([successor]);
    // Nothing broadcast to the lobby carries the tile types of hidden tiles.
    for (const e of ctx.broadcastLog) {
      expect(JSON.stringify(e.data)).not.toContain('"keyCard"');
    }
    // The operatives' view stays masked.
    const otherOp = state(game).teams.blue.operativeIds[0]!;
    const view = game.getStateForPlayer(otherOp) as {
      grid: Array<{
        type: unknown;
        state: string;
      }>;
    };
    expect(view.grid.filter((t) => t.state === 'HIDDEN').every((t) => t.type === null)).toBe(true);

    // The successor can give the clue.
    game.handleInput(successor, 'GIVE_CLUE', {
      word: 'zzqx',
      number: 1,
    });
    expect(state(game).phase).toBe(UndercoverAgentPhase.GUESS);
  });
});

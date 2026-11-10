import { describe, expect, it } from 'vitest';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { GAME_SCORE_RULES } from '@/lib/game/registry';

/**
 * The catalog contract (redesign audit A1 step 7).
 *
 * The catalog is composed from two kinds of source (feature manifests' catalog
 * entries and the remaining hand-kept entry files) and must read the same no
 * matter where an entry physically lives. This snapshot pins the whole thing:
 * every id, the order, and every card field. Moving an entry into
 * `features/<id>/catalog.ts` must leave it byte-for-byte unchanged; a real
 * content edit updates the snapshot (`vitest -u`) in the same commit, which is
 * the point — catalog changes become a reviewed diff.
 *
 * `scoring` (the score-validation half of a game record) is stripped from the
 * card snapshot and pinned separately below, so the two halves are each exact.
 */
function card<T extends object>(entry: T): Omit<T, 'scoring'> {
  const { scoring: _scoring, ...rest } = entry as T & { scoring?: unknown };
  return rest as Omit<T, 'scoring'>;
}

describe('catalog contract', () => {
  it('games: ids, order and every card field', () => {
    expect(games.map(card)).toMatchSnapshot();
  });

  it('apps: ids, order and every card field', () => {
    expect(apps.map(card)).toMatchSnapshot();
  });

  it('scoring rules: every scored board, by id (their order carries no meaning)', () => {
    const byId = [...GAME_SCORE_RULES].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId).toMatchSnapshot();
  });
});

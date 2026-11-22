import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

/**
 * Deleting an account anonymises the user row in place, so a player table's `onDelete: Cascade` never
 * fires: without an explicit delete a deleted member's chosen username stays on every game board.
 * `anonymizeAccount` must delete the member's row in every player table and `GameStat`, and null the
 * co-op run host. The model list below is checked against the Prisma schema, so a player table added
 * later without an erasure fails here.
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) });
  return new Proxy({ $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>, {
    get: (t, key: string) => (key in t ? t[key] : model(key)),
  });
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { anonymizeAccount } from '@/lib/account/deletion.server';

/** Prisma model name to the client delegate name (`GameStat` to `gameStat`). */
const delegate = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

/**
 * Every table that holds a game score for a member and is read by a public board. Hand-kept on
 * purpose: a new one must be added here AND erased, and the schema checks below fail until it is.
 */
const LEADERBOARD_ERASED_MODELS = [
  'LaundryPlayer',
  'VoidBreakerPlayer',
  'NeonDriftwayPlayer',
  'NightrailPlayer',
  'SignalForgePlayer',
  'VegaPlayer',
  'DreamRiftPlayer',
  'GabrielsHornPlayer',
  'Player',
  'GlobeSetPlayer',
  'SynapseStormPlayer',
  'SongLeaderboard',
  'AltairPlayer',
  'GameStat',
] as const;

/**
 * Models named `*Player` that no public board reads: a per-match roster, not a score table. Adding
 * one here is a decision that it is not a board.
 */
const NOT_A_BOARD = new Set(['AltairMatchPlayer']);

const models = Prisma.dmmf.datamodel.models;

/**
 * Models that name a member in a `userId` field with a relation to `User`. (The runtime schema the
 * client carries has no relation details, so this reads the field names and kinds.)
 */
function userIdModels() {
  return models.filter(
    (m) =>
      m.fields.some((f) => f.name === 'userId' && f.kind === 'scalar') &&
      m.fields.some((f) => f.name === 'user' && f.kind === 'object' && f.type === 'User'),
  );
}

describe('anonymizeAccount (game boards)', () => {
  it('deletes the account’s row in every player table and in GameStat', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    for (const name of LEADERBOARD_ERASED_MODELS) {
      const op = tx.find((o) => o.model === delegate(name) && o.method === 'deleteMany');
      expect(op, name).toBeDefined();
      expect(op!.args, name).toEqual({ where: { userId: 'user-1' } });
    }
  });

  it('nulls the co-op run host instead of deleting the squad’s run', async () => {
    (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockClear();
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const op = tx.find((o) => o.model === 'dreamRiftCoopRun');
    expect(op?.method).toBe('updateMany');
    expect(op?.args).toEqual({ where: { hostUserId: 'user-1' }, data: { hostUserId: null } });
  });
});

describe('the player-table list matches the schema', () => {
  it('names only models that exist, each with a userId relation to User', () => {
    const byName = new Map(userIdModels().map((m) => [m.name, m]));
    for (const name of LEADERBOARD_ERASED_MODELS) expect(byName.has(name), name).toBe(true);
  });

  it('covers every model with a `username` and a `userId` relation to User (a new player table fails here)', () => {
    const withUsername = userIdModels()
      .filter((m) => m.fields.some((f) => f.name === 'username'))
      .map((m) => m.name)
      .sort();
    const listed = new Set<string>(LEADERBOARD_ERASED_MODELS);
    expect(withUsername.filter((name) => !listed.has(name))).toEqual([]);
  });

  it('covers every `*Player` and `*Leaderboard` model with a userId, which also catches a board table with no username', () => {
    const boardLike = models
      .filter((m) => /(Player|Leaderboard)$/.test(m.name) && userIdModels().some((u) => u.name === m.name))
      .map((m) => m.name)
      .sort();
    const listed = new Set<string>(LEADERBOARD_ERASED_MODELS);
    expect(boardLike.filter((name) => !listed.has(name) && !NOT_A_BOARD.has(name))).toEqual([]);
  });

  it('still has the co-op host field the erasure nulls', () => {
    const run = models.find((m) => m.name === 'DreamRiftCoopRun')!;
    expect(run.fields.some((f) => f.name === 'hostUserId' && f.kind === 'scalar')).toBe(true);
  });
});

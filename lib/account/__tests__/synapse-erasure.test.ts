import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Synapse Storm's match rows keep their numbers for the other players' history but lose the member's name and id.
 * `SSPlayerMatch`, `SSLobbyMember` and `SSLobby.hostUserId` have no `User` relation, so this test is the record of
 * their erasure. The fake is an in-memory database; its updates are lazy (run by `$transaction`), like Prisma's.
 */

interface Seat {
  id: string;
  matchId?: string;
  lobbyId?: string;
  userId: string;
  displayName: string;
  score?: number;
}
interface Lobby {
  id: string;
  hostUserId: string;
}

const db = vi.hoisted(() => ({
  playerMatches: [] as Seat[],
  lobbyMembers: [] as Seat[],
  lobbies: [] as Lobby[],
}));

type Op = { run: () => number; sql: string; values: unknown[] };

// The operations are three set-based raw UPDATEs. The fake keeps each one's SQL text and values (asserted below) and
// applies the same rule to the in-memory rows when run, lazily like Prisma's `$transaction` operations.
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]): Op => {
      const sql = strings.join('?');
      const table = /^UPDATE "(\w+)"/.exec(sql)![1];
      const [a, b] = values as string[];
      return {
        sql,
        values,
        run: () => {
          if (table === 'ss_player_match' || table === 'ss_lobby_member') {
            const rows = table === 'ss_player_match' ? db.playerMatches : db.lobbyMembers;
            const hit = rows.filter((r) => r.userId === b);
            for (const r of hit) Object.assign(r, { userId: `deleted:${r.id}`, displayName: a });
            return hit.length;
          }
          const hit = db.lobbies.filter((l) => l.hostUserId === a);
          for (const l of hit) l.hostUserId = `deleted:${l.id}`;
          return hit.length;
        },
      };
    },
  },
}));

const { synapseMatchErasureOps } = await import('@features/synapse-storm/engine/matches.server');

function erase(userId: string) {
  return (synapseMatchErasureOps(userId) as unknown as Op[]).map((o) => o.run());
}

beforeEach(() => {
  db.playerMatches.length = 0;
  db.lobbyMembers.length = 0;
  db.lobbies.length = 0;
  db.playerMatches.push(
    { id: 'pm1', matchId: 'm1', userId: 'me', displayName: 'Me', score: 10 },
    { id: 'pm2', matchId: 'm1', userId: 'ann', displayName: 'Ann', score: 20 },
    { id: 'pm3', matchId: 'm2', userId: 'me', displayName: 'Me', score: 30 },
    { id: 'pm4', matchId: 'm2', userId: 'guest:sock1', displayName: 'Guest', score: 40 },
  );
  db.lobbyMembers.push(
    { id: 'lm1', lobbyId: 'l1', userId: 'me', displayName: 'Me' },
    { id: 'lm2', lobbyId: 'l1', userId: 'ann', displayName: 'Ann' },
    { id: 'lm3', lobbyId: 'l2', userId: 'me', displayName: 'Me' },
  );
  db.lobbies.push({ id: 'l1', hostUserId: 'me' }, { id: 'l2', hostUserId: 'ann' }, { id: 'l3', hostUserId: 'me' });
});

describe('synapseMatchErasureOps', () => {
  it('tombstones the member’s match rows, lobby seats and hosted lobbies, name and id', () => {
    erase('me');
    const mine = db.playerMatches.filter((r) => r.id === 'pm1' || r.id === 'pm3');
    expect(mine.map((r) => [r.userId, r.displayName])).toEqual([
      ['deleted:pm1', 'Deleted user'],
      ['deleted:pm3', 'Deleted user'],
    ]);
    // the numbers other players still see are kept
    expect(mine.map((r) => r.score)).toEqual([10, 30]);
    expect(db.lobbyMembers.filter((r) => r.id !== 'lm2').map((r) => [r.userId, r.displayName])).toEqual([
      ['deleted:lm1', 'Deleted user'],
      ['deleted:lm3', 'Deleted user'],
    ]);
    expect(db.lobbies.filter((l) => l.id !== 'l2').map((l) => l.hostUserId)).toEqual(['deleted:l1', 'deleted:l3']);
  });

  it('leaves no row that carries the member’s id', () => {
    erase('me');
    const all = JSON.stringify([db.playerMatches, db.lobbyMembers, db.lobbies]);
    expect(all).not.toContain('"me"');
    expect(all).not.toContain('"Me"');
  });

  it('touches no other member’s or guest’s row', () => {
    const before = JSON.stringify([
      db.playerMatches.filter((r) => r.userId !== 'me'),
      db.lobbyMembers.filter((r) => r.userId !== 'me'),
      db.lobbies.filter((l) => l.hostUserId !== 'me'),
    ]);
    erase('me');
    const after = JSON.stringify([
      db.playerMatches.filter((r) => r.id === 'pm2' || r.id === 'pm4'),
      db.lobbyMembers.filter((r) => r.id === 'lm2'),
      db.lobbies.filter((l) => l.id === 'l2'),
    ]);
    expect(after).toBe(before);
  });

  it('gives each tombstone its own id, so the unique keys on (match, user) and (lobby, user) still hold', () => {
    erase('me');
    const keys = db.playerMatches.map((r) => `${r.matchId}/${r.userId}`);
    expect(new Set(keys).size).toBe(keys.length);
    const seats = db.lobbyMembers.map((r) => `${r.lobbyId}/${r.userId}`);
    expect(new Set(seats).size).toBe(seats.length);
  });

  it('is safe to run twice, and does nothing for a member with no rows', () => {
    erase('me');
    const snapshot = JSON.stringify([db.playerMatches, db.lobbyMembers, db.lobbies]);
    expect(erase('me')).toEqual([0, 0, 0]);
    expect(erase('nobody')).toEqual([0, 0, 0]);
    expect(JSON.stringify([db.playerMatches, db.lobbyMembers, db.lobbies])).toBe(snapshot);
  });

  it('is exactly three set-based, parameterized statements (no per-row operations, no read first)', () => {
    const ops = synapseMatchErasureOps('me') as unknown as Op[];
    expect(ops.map((o) => o.sql)).toEqual([
      'UPDATE "ss_player_match" SET "userId" = \'deleted:\' || "id", "displayName" = ? WHERE "userId" = ?',
      'UPDATE "ss_lobby_member" SET "userId" = \'deleted:\' || "id", "displayName" = ? WHERE "userId" = ?',
      'UPDATE "ss_lobby" SET "hostUserId" = \'deleted:\' || "id" WHERE "hostUserId" = ?',
    ]);
    expect(ops.map((o) => o.values)).toEqual([['Deleted user', 'me'], ['Deleted user', 'me'], ['me']]);
  });
});

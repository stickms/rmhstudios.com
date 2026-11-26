import { describe, expect, it } from 'vitest';
import {
  COOP_FINISH_WINDOW_MS,
  COOP_UNFINISHED_TTL_MS,
  decodeCoopCursor,
  encodeCoopCursor,
  finishCutoff,
  memberIdsBySlot,
  pruneCutoff,
  readStoredPlayers,
  resolvePlayerView,
  slotAccountId,
  type CoopHiding,
  type CoopUserLookup,
} from '../coop-runs';

const now = new Date('2027-01-10T12:00:00Z');
const user = (id: string, over: Partial<CoopUserLookup> = {}): CoopUserLookup => ({
  id,
  handle: `h-${id}`,
  name: `Name ${id}`,
  image: null,
  bannedUntil: null,
  banReason: null,
  ...over,
});
const stored = (over: Record<string, unknown> = {}) =>
  readStoredPlayers([{ slot: 1, name: 'Typed', charId: 'mls', score: 5, ...over }])[0]!;

describe('co-op run rules', () => {
  it('windows: six hours to finish, a day before an unfinished run is pruned', () => {
    expect(finishCutoff(now).getTime()).toBe(now.getTime() - COOP_FINISH_WINDOW_MS);
    expect(COOP_FINISH_WINDOW_MS).toBe(6 * 3_600_000);
    expect(pruneCutoff(now).getTime()).toBe(now.getTime() - COOP_UNFINISHED_TTL_MS);
    expect(COOP_UNFINISHED_TTL_MS).toBe(24 * 3_600_000);
  });

  it('memberIds are by slot, guests and empty seats are empty strings', () => {
    expect(
      memberIdsBySlot([
        { slot: 0, userId: 'a' },
        { slot: 2, userId: 'guest' },
        { slot: 3, userId: 'b' },
        { slot: 9, userId: 'out-of-range' },
      ]),
    ).toEqual(['a', '', '', 'b']);
  });

  it('a hub row takes the account from memberIds by slot; an old row from its stored id only', () => {
    const hub = { startedAt: now, memberIds: ['a', 'b', '', ''] };
    expect(slotAccountId(hub, stored({ slot: 1, account: { id: 'forged' } }))).toBe('b');
    expect(slotAccountId(hub, stored({ slot: 2 }))).toBeNull();
    expect(slotAccountId(hub, stored({ slot: null }))).toBeNull();
    const old = { startedAt: null, memberIds: [] as string[] };
    expect(slotAccountId(old, stored({ slot: undefined, account: { id: 'x' } }))).toBe('x');
    expect(slotAccountId(old, stored({ slot: undefined, account: null }))).toBeNull();
  });

  it('a slot is a player, a guest, "A player" or deleted, and never carries an id', () => {
    const none: CoopHiding = { hidden: new Set<string>() };
    const users = new Map([
      ['p', user('p')],
      ['h', user('h')],
      ['b', user('b', { bannedUntil: new Date('2027-02-01T00:00:00Z') })],
      ['gone', user('gone', { banReason: 'account_deleted' })],
      ['noname', user('noname', { name: null })],
    ]);
    const view = (id: string | null, hiding = none) => resolvePlayerView(stored(), id, users, hiding, now);
    expect(view('p')).toMatchObject({ kind: 'player', name: 'Name p', handle: 'h-p' });
    expect(view(null)).toMatchObject({ kind: 'guest', name: 'Typed', handle: null });
    expect(view('h', { hidden: new Set(['h']) })).toMatchObject({ kind: 'anonymous', name: null });
    expect(view('p', { hidden: new Set(), blocked: new Set(['p']) })).toMatchObject({ kind: 'anonymous' });
    expect(view('b')).toMatchObject({ kind: 'anonymous', name: null });
    expect(view('gone')).toMatchObject({ kind: 'deleted', name: null });
    expect(view('missing')).toMatchObject({ kind: 'deleted' });
    expect(view('deleted-user')).toMatchObject({ kind: 'deleted' });
    expect(view('noname')).toMatchObject({ kind: 'anonymous' });
    for (const id of ['p', null, 'h', 'b', 'gone']) expect(Object.keys(view(id))).not.toContain('id');
  });

  it('the cursor round-trips and rejects junk', () => {
    const cursor = { at: new Date('2027-01-10T10:20:00.123Z'), id: 'run-1' };
    const back = decodeCoopCursor(encodeCoopCursor(cursor));
    expect(back?.at.getTime()).toBe(cursor.at.getTime());
    expect(back?.id).toBe('run-1');
    for (const bad of ['', 'x', 'bm90LWEtY3Vyc29y', 'a'.repeat(300)]) expect(decodeCoopCursor(bad)).toBeNull();
  });

  it('reads whatever the JSON column holds without throwing', () => {
    expect(readStoredPlayers(null)).toEqual([]);
    expect(readStoredPlayers([1, 'x', null, { score: 'NaN' }])).toHaveLength(1);
  });
});

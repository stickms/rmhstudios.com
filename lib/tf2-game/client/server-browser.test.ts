/**
 * The server browser's logic: filters, search, sorting by every column (an
 * unknown P2P ping always last), Quick Play's pick, and the saved lists'
 * storage (malformed entries dropped, storage that throws survived).
 */
import { describe, expect, it } from 'vitest';
import type { RoomListEntry } from '../net/events';
import {
  DEFAULT_FILTERS,
  filterRooms,
  quickPlayPick,
  readSaved,
  remember,
  roomPing,
  savedFrom,
  sortRooms,
  writeSaved,
} from './server-browser';

const room = (over: Partial<RoomListEntry>): RoomListEntry => ({
  code: 'AAAAAA',
  name: 'Server',
  map: 'ctf_2fort',
  mode: 'ctf',
  players: 0,
  bots: 0,
  maxPlayers: 12,
  state: 'running',
  kind: 'dedicated',
  ...over,
});

const ROOMS = [
  room({ code: 'AAAAAA', name: 'Alpha', players: 3, bots: 4 }),
  room({ code: 'BBBBBB', name: 'Bravo', map: 'koth_viaduct', mode: 'koth', players: 12, maxPlayers: 12 }),
  room({ code: 'CCCCCC', name: 'Charlie', kind: 'p2p', host: 'Medic', players: 2, bots: 6, maxPlayers: 10 }),
  room({ code: 'DDDDDD', name: 'Delta', map: 'pl_upward', mode: 'pl', players: 0, bots: 0 }),
  room({ code: 'EEEEEE', name: 'Echo', kind: 'p2p', host: 'Scout', players: 1, bots: 0, state: 'loading' }),
];

describe('server browser', () => {
  it('filters by map, mode, type, fullness, humans and emptiness, and searches names, maps, hosts and codes', () => {
    const codes = (f: Partial<typeof DEFAULT_FILTERS>) => filterRooms(ROOMS, { ...DEFAULT_FILTERS, ...f }, (m) => (m === 'pl_upward' ? 'Upward' : m)).map((r) => r.code);
    expect(codes({ map: 'koth_viaduct' })).toEqual(['BBBBBB']);
    expect(codes({ mode: 'pl' })).toEqual(['DDDDDD']);
    expect(codes({ kind: 'p2p' })).toEqual(['CCCCCC', 'EEEEEE']);
    expect(codes({ notFull: true })).not.toContain('BBBBBB');
    expect(codes({ hasHumans: true })).not.toContain('DDDDDD');
    expect(codes({ hideEmpty: true })).toEqual(['AAAAAA', 'BBBBBB', 'CCCCCC', 'EEEEEE']);
    expect(codes({ search: 'medic' })).toEqual(['CCCCCC']);
    expect(codes({ search: 'upward' })).toEqual(['DDDDDD']);
    expect(codes({ search: 'eeeee' })).toEqual(['EEEEEE']);
  });

  it('sorts by any column both ways; an unknown (P2P) ping sorts last either way', () => {
    const by = (key: Parameters<typeof sortRooms>[1], dir: 'asc' | 'desc') => sortRooms(ROOMS, key, dir, 40).map((r) => r.code);
    expect(by('name', 'asc')).toEqual(['AAAAAA', 'BBBBBB', 'CCCCCC', 'DDDDDD', 'EEEEEE']);
    expect(by('name', 'desc')[0]).toBe('EEEEEE');
    expect(by('players', 'desc')).toEqual(['BBBBBB', 'AAAAAA', 'CCCCCC', 'EEEEEE', 'DDDDDD']);
    expect(by('ping', 'asc').slice(-2)).toEqual(['CCCCCC', 'EEEEEE']);
    expect(by('ping', 'desc').slice(-2)).toEqual(['CCCCCC', 'EEEEEE']);
    expect(by('host', 'desc').slice(0, 2)).toEqual(['EEEEEE', 'CCCCCC']);
    expect(by('kind', 'desc').slice(0, 2)).toEqual(['CCCCCC', 'EEEEEE']);
    expect(roomPing(ROOMS[2], 40)).toBeNull();
    expect(roomPing(ROOMS[0], 40.4)).toBe(40);
  });

  it('Quick Play picks the busiest open running room for the wish, else nothing', () => {
    expect(quickPlayPick(ROOMS, {}, 30)?.code).toBe('AAAAAA');
    expect(quickPlayPick(ROOMS, { mode: 'koth' }, 30)).toBeNull(); // Bravo is full
    expect(quickPlayPick(ROOMS, { map: 'pl_upward' }, 30)?.code).toBe('DDDDDD');
    expect(quickPlayPick([ROOMS[2], ROOMS[4]], {}, 30)?.code).toBe('CCCCCC');
    expect(quickPlayPick([], {}, null)).toBeNull();
  });

  it('remembers favorites and recent servers, dropping anything malformed', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    let list = remember([], savedFrom(ROOMS[0], 1));
    list = remember(list, savedFrom(ROOMS[2], 2));
    list = remember(list, savedFrom(ROOMS[0], 3));
    expect(list.map((s) => [s.code, s.at])).toEqual([
      ['AAAAAA', 3],
      ['CCCCCC', 2],
    ]);
    writeSaved('k', list, storage);
    expect(readSaved('k', storage)).toEqual(list);
    store.set('k', JSON.stringify([{ code: 'nope', name: 'x', map: 'y', kind: 'p2p', at: 1 }, { code: 'ZZZZZZ' }, ...list]));
    expect(readSaved('k', storage)).toEqual(list);
    store.set('k', '{not json');
    expect(readSaved('k', storage)).toEqual([]);
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(readSaved('k', throwing)).toEqual([]);
    expect(() => writeSaved('k', list, throwing)).not.toThrow();
  });
});

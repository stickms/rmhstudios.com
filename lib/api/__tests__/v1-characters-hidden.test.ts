/**
 * s15-18 (S13-19): `GET /api/v1/me/parties/{id}` names a player the key owner is blocked with `'A player'` (the
 * English text existing clients read) and now also says so with `nameHidden: true`, on the members and on the turn
 * order, so a client that translates can show its own wording. Visible players carry `nameHidden: false`. The party
 * module is the site's own, replaced here by its result.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';

const h = vi.hoisted(() => ({ party: null as unknown }));

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@features/rmhcharacters/engine/party.server', () => ({
  getParty: vi.fn(async () => h.party),
  listParties: vi.fn(async () => []),
}));

import { getPartyForKey } from '@/lib/api/v1/characters.server';
import { ENDPOINTS } from '@/lib/api/registry';

const JOINED = new Date('2026-11-01T18:00:00.000Z').getTime();

beforeEach(() => {
  h.party = {
    id: 'pa',
    name: 'Thursday table',
    system: 'dnd5e',
    role: 'player',
    gm: 'Ada',
    ownerId: 'gm1',
    turnIndex: 0,
    members: [
      { userId: 'gm1', name: 'Ada', joinedAt: JOINED, isGm: true, hidden: false, summary: null },
      { userId: 'p2', name: '', joinedAt: JOINED, isGm: false, hidden: true, summary: null },
      { userId: 'p3', name: 'Cy', joinedAt: JOINED, isGm: false, summary: null },
    ],
    order: [
      { id: 'l1', kind: 'member', userId: 'p2', name: '', hidden: true, value: 17 },
      { id: 'l2', kind: 'extra', userId: null, name: 'Goblin', value: 12 },
      { id: 'l3', kind: 'member', userId: 'gm1', name: 'Ada', hidden: false, value: 9 },
    ],
  };
});

describe('a hidden party member in the developer API', () => {
  it('carries nameHidden: true and keeps the English name for existing clients', async () => {
    const party = await getPartyForKey('me', 'pa');
    assertJsonSafe(party);
    const hidden = party!.members.find((m) => m.userId === 'p2')!;
    expect(hidden).toMatchObject({ name: 'A player', nameHidden: true, summary: null });
    const line = party!.order.find((l) => l.id === 'l1')!;
    expect(line).toMatchObject({ name: 'A player', nameHidden: true });
  });

  it('says nameHidden: false for everyone the viewer can see, whether or not the flag was set', async () => {
    const party = await getPartyForKey('me', 'pa');
    expect(party!.members.filter((m) => m.userId !== 'p2').map((m) => [m.name, m.nameHidden])).toEqual([
      ['Ada', false],
      ['Cy', false],
    ]);
    expect(party!.order.filter((l) => l.id !== 'l1').map((l) => l.nameHidden)).toEqual([false, false]);
  });

  it('adds the field without changing any other: the rest of a member is as before', async () => {
    const party = await getPartyForKey('me', 'pa');
    expect(Object.keys(party!.members[0]!).sort()).toEqual(
      ['isGm', 'joinedAt', 'name', 'nameHidden', 'summary', 'userId'].sort(),
    );
    expect(Object.keys(party!.order[0]!).sort()).toEqual(['id', 'kind', 'name', 'nameHidden', 'userId', 'value']);
  });

  it('is not found for a party the owner is not in', async () => {
    h.party = null;
    expect(await getPartyForKey('me', 'pa')).toBeNull();
  });

  it('is documented: the registry example carries the field', () => {
    const entry = ENDPOINTS.find((e) => e.operationId === 'getMyParty')!;
    const data = (entry.responseExample as { data: { members: object[]; order: object[] } }).data;
    expect(data.members[0]).toHaveProperty('nameHidden', false);
    expect(data.order[0]).toHaveProperty('nameHidden', false);
  });
});

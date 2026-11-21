/**
 * A host edits a watch party's name/time on the web tier after the hub loaded
 * the room; the hub re-reads those fields on browse/join (no other channel).
 */
import { describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
vi.mock('../prisma-client', () => ({
  getPrismaClient: () => ({ rmhTubeRoom: { findMany } }),
  disconnectPrisma: () => Promise.resolve(),
}));

import { RoomManager } from '../room-manager';

type Rooms = Map<string, { id: string; name: string | null; scheduledFor: number | null }>;

function make(rooms: Array<{ id: string; name: string | null; scheduledFor: number | null }>) {
  const rm = new RoomManager({} as never);
  const map = (rm as unknown as { rooms: Rooms }).rooms;
  for (const r of rooms) map.set(r.id, r);
  return { rm, map };
}

describe('RoomManager.refreshScheduledFields', () => {
  it('pulls the edited name and time from the DB row for scheduled rooms only', async () => {
    findMany.mockReset();
    findMany.mockResolvedValue([{ id: 'p1', name: 'New name', scheduledFor: new Date(2_000) }]);
    const { rm, map } = make([
      { id: 'p1', name: 'Old', scheduledFor: 1_000 },
      { id: 'adhoc', name: 'Ad hoc', scheduledFor: null },
    ]);
    await rm.refreshScheduledFields([...map.values()] as never);
    expect(findMany.mock.calls[0]?.[0].where.id.in).toEqual(['p1']);
    expect(map.get('p1')).toMatchObject({ name: 'New name', scheduledFor: 2_000 });
    expect(map.get('adhoc')).toMatchObject({ name: 'Ad hoc', scheduledFor: null });
  });

  it('keeps the old values when the read fails and skips the read with no parties', async () => {
    findMany.mockReset();
    findMany.mockRejectedValue(new Error('db down'));
    const { rm, map } = make([{ id: 'p1', name: 'Old', scheduledFor: 1_000 }]);
    await rm.refreshScheduledFields([...map.values()] as never);
    expect(map.get('p1')?.name).toBe('Old');
    findMany.mockReset();
    await rm.refreshScheduledFields([{ id: 'x', name: null, scheduledFor: null }] as never);
    expect(findMany).not.toHaveBeenCalled();
  });
});

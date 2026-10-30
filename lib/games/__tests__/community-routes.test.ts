import { describe, expect, it } from 'vitest';
import { listCuratedBuilds } from '@/lib/builds/curated';

// `/games/$gameId` shares its namespace with the static community routes; a title
// with one of these ids would be unreachable (the static route wins).
const RESERVED = ['community', 'profile', 'groups', 'inventory', 'market', 'trades', 'hub'];

describe('community route segments', () => {
  it('are not catalog ids', () => {
    const ids = new Set(listCuratedBuilds().map((b) => b.id));
    for (const r of RESERVED) expect(ids.has(r)).toBe(false);
  });
});

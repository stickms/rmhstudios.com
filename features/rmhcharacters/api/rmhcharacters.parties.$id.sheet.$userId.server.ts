import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { readPartySheetApi } from '@features/rmhcharacters/engine/party.contract';
import { partyMemberParams } from '@features/rmhcharacters/engine/party-schema';
import { partyNotFound, readPartySheet } from '@features/rmhcharacters/engine/party.server';

/**
 * GET /api/rmhcharacters/parties/$id/sheet/$userId — the game master opens one player's sheet read-only: only a current
 * member who turned "Let the game master open my full sheet" on, with `notes` and `portrait` removed. Every other case
 * (not the game master, not a member, not shared, left, removed) is the same 404. Never cached.
 */
export const route = apiRoute('/api/rmhcharacters/parties/$id/sheet/$userId', {
  GET: implement(readPartySheetApi, { rateLimit: 'read' }, async ({ userId, params }) => {
    const p = partyMemberParams.safeParse(params);
    if (!p.success) return partyNotFound();
    const character = await readPartySheet(p.data.id, userId, p.data.userId);
    return character
      ? Response.json({ character }, { headers: { 'Cache-Control': 'private, no-store' } })
      : partyNotFound();
  }),
});

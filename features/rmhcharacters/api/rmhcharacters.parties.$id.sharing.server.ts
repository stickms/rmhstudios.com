import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { setPartySharingApi } from '@features/rmhcharacters/engine/party.contract';
import { partyIdParams, sharingBody } from '@features/rmhcharacters/engine/party-schema';
import { partyNotFound, setSheetShared } from '@features/rmhcharacters/engine/party.server';

/** PUT /api/rmhcharacters/parties/$id/sharing — the member's own switch: let the game master open their full sheet. */
export const route = apiRoute('/api/rmhcharacters/parties/$id/sharing', {
  PUT: implement(setPartySharingApi, { rateLimit: 'write', body: sharingBody }, async ({ userId, params, body }) => {
    const p = partyIdParams.safeParse(params);
    if (!p.success) return partyNotFound();
    return (await setSheetShared(p.data.id, userId, body.sheetShared)) ? { ok: true as const } : partyNotFound();
  }),
});

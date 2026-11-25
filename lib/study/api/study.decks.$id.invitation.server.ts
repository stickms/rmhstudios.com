import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { respondDeckInvitationApi } from '@/lib/study/deck-editors.contract';
import { respondInvitationBody } from '@/lib/study/deck-editors-schema';
import { acceptInvitation, declineInvitation } from '@/lib/study/deck-editors.server';

/** POST /api/study/decks/$id/invitation — the invitee accepts or declines their own invitation. */
export const route = apiRoute('/api/study/decks/$id/invitation', {
  POST: implement(
    respondDeckInvitationApi,
    { rateLimit: 'write', body: respondInvitationBody },
    async ({ userId, params, body }) => {
      const result = body.accept
        ? await acceptInvitation(userId, params.id)
        : await declineInvitation(userId, params.id);
      if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: result.status });
      return { success: true as const, accepted: body.accept };
    },
  ),
});

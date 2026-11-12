import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getWagerApi } from '@/lib/wager/wager.contract';
import { getWager } from '@/lib/wager/wager.server';

export const route = apiRoute('/api/wager/$id', {
  GET: implement(getWagerApi, { auth: 'optional' }, async ({ params, session }) => {
    const wager = await getWager(params.id, session?.user?.id ?? null);
    if (!wager) return Response.json({ error: 'Not found' }, { status: 404 });
    return { wager };
  }),
});

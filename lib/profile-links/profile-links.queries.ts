/** The signed-in member's profile links as a route-seeded query (redesign audit B4). Signed out: nothing is seeded. */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import { listProfileLinksApi } from '@/lib/profile-links/profile-links.contract';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { listProfileLinks, toProfileLinkDTO } from '@/lib/profile-links/links.server';

// Same body as GET /api/profile-links.
const getProfileLinksOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  const rows = await listProfileLinks(session.user.id);
  return { links: rows.map(toProfileLinkDTO) };
});

export const profileLinksQuery = () =>
  queryOptions({
    queryKey: ['settings', 'profile-links'],
    queryFn: routeQueryFn(
      () => getProfileLinksOnServer(),
      () => api(listProfileLinksApi),
    ),
    staleTime: 15_000,
  });

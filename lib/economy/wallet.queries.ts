/** The wallet balance as a route-seeded query (redesign audit B4). Signed out: nothing is seeded. */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { fetchJson } from '@/lib/http';
import { routeQueryFn } from '@/lib/route/route-query';

import { getRequestSession } from '@/lib/auth-session.server';
import { prisma } from '@/lib/prisma.server';

const getBalanceOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  const profile = await prisma.userProfile.findUnique({
    where: { userId: session.user.id },
    select: { coins: true },
  });
  // Same default as GET /api/coins.
  return { coins: profile?.coins ?? 10 };
});

export const walletBalanceQuery = () =>
  queryOptions({
    queryKey: ['economy-plus', 'balance'],
    queryFn: routeQueryFn(
      () => getBalanceOnServer(),
      () => fetchJson<{ coins: number }>('/api/coins'),
    ),
    staleTime: 15_000,
  });

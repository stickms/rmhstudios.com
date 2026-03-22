import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const Route = createFileRoute('/api/users/search')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  const ip = getClientIp(request);
  const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: "users-search" });
  if (!allowed) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429 });

  const q = new URL(request.url).searchParams.get('q')?.trim();
  if (!q) {
    return Response.json({ users: [] });
  }

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
        { handle: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: userDisplaySelect,
    take: 5,
  });

  return Response.json({ users: users.map(resolveUser) });
},
    },
  },
});

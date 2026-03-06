import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const Route = createFileRoute('/api/forest-explorer/save')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const save = await prisma.forestExplorerSave.findUnique({
    where: { userId: session.user.id },
  });

  return Response.json({
    saveData: save?.saveData ?? null,
  });
},
  POST: async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const { allowed, retryAfter } = rateLimit(ip, {
    limit: 20,
    windowMs: 60_000,
    prefix: 'forest-explorer-save',
  });
  if (!allowed) {
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let body: { saveData?: object };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { saveData } = body;
  if (!saveData || typeof saveData !== 'object') {
    return Response.json({ error: 'Missing or invalid saveData' }, { status: 400 });
  }

  // Validate body size (max 200KB)
  const bodyStr = JSON.stringify(saveData);
  if (bodyStr.length > 200_000) {
    return Response.json({ error: 'Payload too large' }, { status: 413 });
  }

  const userId = session.user.id;

  const save = await prisma.forestExplorerSave.upsert({
    where: { userId },
    create: { userId, saveData },
    update: { saveData },
  });

  return Response.json({ success: true, updatedAt: save.updatedAt });
},
    },
  },
});

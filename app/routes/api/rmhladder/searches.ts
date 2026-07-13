import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

const filtersSchema = z.object({
  preset: z.enum(['new', 'finance', 'consulting', 'tech', 'expiring', 'remote']).optional(),
  q: z.string().max(200).optional(),
  cities: z.array(z.string().max(100)).max(50).optional(),
  programTypes: z.array(z.enum([
    'internship', 'summer_analyst', 'summer_associate', 'analyst_program', 'rotational_program',
    'new_grad', 'leadership_development', 'entry_level', 'mba', 'other',
  ])).max(10).optional(),
  sort: z.enum(['relevance', 'posted', 'deadline']).optional(),
});
const saveSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(100),
  filters: filtersSchema,
  alertsOn: z.boolean().default(true),
});

async function viewer(request: Request) {
  return auth.api.getSession({ headers: request.headers });
}

export const Route = createFileRoute('/api/rmhladder/searches')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await viewer(request);
        if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        return Response.json(await prisma.ladderSavedSearch.findMany({
          where: { userId: session.user.id },
          orderBy: { updatedAt: 'desc' },
        }));
      },
      POST: async ({ request }) => {
        const session = await viewer(request);
        if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const parsed = saveSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: 'Invalid saved search' }, { status: 400 });
        await prisma.ladderUserPrefs.upsert({
          where: { userId: session.user.id },
          create: { userId: session.user.id },
          update: {},
        });
        const { id, ...data } = parsed.data;
        if (id) {
          const updated = await prisma.ladderSavedSearch.updateMany({
            where: { id, userId: session.user.id },
            data,
          });
          if (updated.count === 0) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json(await prisma.ladderSavedSearch.findUnique({ where: { id } }));
        }
        return Response.json(await prisma.ladderSavedSearch.create({
          data: { ...data, userId: session.user.id },
        }), { status: 201 });
      },
      DELETE: async ({ request }) => {
        const session = await viewer(request);
        if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const id = new URL(request.url).searchParams.get('id');
        if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
        const deleted = await prisma.ladderSavedSearch.deleteMany({ where: { id, userId: session.user.id } });
        return deleted.count ? new Response(null, { status: 204 }) : Response.json({ error: 'Not found' }, { status: 404 });
      },
    },
  },
});

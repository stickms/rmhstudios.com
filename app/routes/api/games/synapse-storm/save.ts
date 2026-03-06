import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export const Route = createFileRoute('/api/games/synapse-storm/save')({
  server: {
    handlers: {
  GET: async ({ request }) => {
    const session = await auth.api.getSession({
        headers: request.headers,
    });

    if (!session) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const player = await prisma.synapseStormPlayer.findUnique({
            where: { userId: session.user.id },
        });

        if (!player) {
            return Response.json(null, { status: 404 });
        }

        return Response.json(player);
    } catch (error) {
        console.error('Error loading Synapse Storm save:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
},
    },
  },
});

import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
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
            // No row yet is a normal state for a first-time player, not an error: a
            // 404 here shows as a red failed request in every new player's console.
            return Response.json(null);
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

import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { loadSynapseStormSaveApi } from '@/lib/synapse-storm/synapse-storm.contract';

export const Route = createFileRoute('/api/games/synapse-storm/save')({
  server: {
    handlers: {
      GET: implement(loadSynapseStormSaveApi, {}, async ({ session }) => {
        const player = await prisma.synapseStormPlayer.findUnique({
          where: { userId: session.user.id },
        });

        // No row yet is a normal state for a first-time player, not an error: a
        // 404 here shows as a red failed request in every new player's console.
        return player ? (player as unknown as Record<string, unknown>) : null;
      }),
    },
  },
});

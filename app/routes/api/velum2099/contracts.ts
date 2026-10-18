import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import {
  minSeconds,
  routeIsPlayable,
  submitContractSchema,
  type ContractView,
} from '@/lib/velum2099/contracts';

/**
 * GET  /api/velum2099/contracts — the board: newest records first (R12).
 * POST /api/velum2099/contracts — post a delivery route with your time. If the
 * route is already on the board this is an attempt at its record; the faster
 * time takes the credit. No coins either way.
 */
const holderInclude = { holder: { select: userDisplaySelect } } as const;

type Row = {
  id: string;
  pickupX: number;
  pickupZ: number;
  dropX: number;
  dropZ: number;
  bestCentis: number;
  runs: number;
  holderId: string | null;
  recordSetAt: Date;
  holder: Parameters<typeof resolveUser>[0] | null;
};

function view(row: Row, viewerId: string): ContractView {
  const holder = row.holder ? resolveUser(row.holder) : null;
  return {
    id: row.id,
    pickupX: row.pickupX,
    pickupZ: row.pickupZ,
    dropX: row.dropX,
    dropZ: row.dropZ,
    bestSeconds: row.bestCentis / 100,
    runs: row.runs,
    holder: holder ? { name: holder.name, username: holder.username } : null,
    mine: row.holderId === viewerId,
    recordSetAt: row.recordSetAt.toISOString(),
  };
}

export const Route = createFileRoute('/api/velum2099/contracts')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
        const rows = await prisma.velumContract.findMany({
          orderBy: { recordSetAt: 'desc' },
          take: 30,
          include: holderInclude,
        });
        return Response.json(
          { contracts: rows.map((r) => view(r, userId)) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
      }),
      POST: defineHandler(
        { rateLimit: 'write', body: submitContractSchema },
        async ({ userId, body }) => {
          const { seconds, ...route } = body;
          if (!routeIsPlayable(route) || seconds < minSeconds(route)) {
            return Response.json({ error: 'implausible-run' }, { status: 422 });
          }
          const centis = Math.round(seconds * 100);

          const existing = await prisma.velumContract.findUnique({
            where: {
              pickupX_pickupZ_dropX_dropZ: {
                pickupX: route.pickupX,
                pickupZ: route.pickupZ,
                dropX: route.dropX,
                dropZ: route.dropZ,
              },
            },
          });
          if (!existing) {
            try {
              const created = await prisma.velumContract.create({
                data: { ...route, creatorId: userId, holderId: userId, bestCentis: centis },
                include: holderInclude,
              });
              return Response.json(
                { result: 'posted', contract: view(created, userId) },
                { status: 201 },
              );
            } catch {
              // Lost a race with another poster of the same route: fall through
              // and treat this as an attempt on the record they just set.
            }
          }
          const target =
            existing ??
            (await prisma.velumContract.findUnique({
              where: {
                pickupX_pickupZ_dropX_dropZ: {
                  pickupX: route.pickupX,
                  pickupZ: route.pickupZ,
                  dropX: route.dropX,
                  dropZ: route.dropZ,
                },
              },
            }));
          if (!target) return Response.json({ error: 'conflict' }, { status: 409 });

          // Conditional update: only a strictly faster time takes the record, and
          // two simultaneous attempts cannot both win.
          const won = await prisma.velumContract.updateMany({
            where: { id: target.id, bestCentis: { gt: centis } },
            data: {
              bestCentis: centis,
              holderId: userId,
              recordSetAt: new Date(),
              runs: { increment: 1 },
            },
          });
          if (won.count === 0) {
            await prisma.velumContract.update({
              where: { id: target.id },
              data: { runs: { increment: 1 } },
            });
          }
          const fresh = await prisma.velumContract.findUniqueOrThrow({
            where: { id: target.id },
            include: holderInclude,
          });
          return Response.json({
            result: won.count ? 'record' : 'slower',
            previousSeconds: target.bestCentis / 100,
            contract: view(fresh, userId),
          });
        },
      ),
    },
  },
});

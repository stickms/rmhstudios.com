import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { mapAliasMissApi } from '@features/medschools/medschools.contract';
import type { MedPrisma } from '../scrape/types';
import { mapAliasMiss } from './alias-admin.server';

/** POST /api/admin/medschools/alias-misses/map — attach a missed source key to a school (409 on a key collision). */
export const route = apiRoute('/api/admin/medschools/alias-misses/map', {
  POST: implement(
    mapAliasMissApi,
    {
      auth: 'admin',
      rateLimit: 'write',
      body: z.object({
        missId: z.string().min(1).max(64),
        schoolId: z.string().min(1).max(64),
      }),
    },
    async ({ body }) => {
      const r = await mapAliasMiss(prisma as unknown as MedPrisma, body);
      if (!r.ok) {
        return Response.json(
          {
            error: r.message,
            code: r.code,
          },
          {
            status: r.status,
          },
        );
      }
      return Response.json({
        aliasId: r.aliasId,
      });
    },
  ),
});

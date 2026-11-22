import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { ignoreAliasMissApi } from '@features/medschools/medschools.contract';
import type { MedPrisma } from '../scrape/types';
import { ignoreAliasMiss } from './alias-admin.server';

/** POST /api/admin/medschools/alias-misses/ignore — dismiss a source name that is not a US MD/DO school. */
export const route = apiRoute('/api/admin/medschools/alias-misses/ignore', {
  POST: implement(
    ignoreAliasMissApi,
    {
      auth: 'admin',
      rateLimit: 'write',
      body: z.object({
        missId: z.string().min(1).max(64),
      }),
    },
    async ({ body }) => {
      const r = await ignoreAliasMiss(prisma as unknown as MedPrisma, body.missId);
      if (!r.ok)
        return Response.json(
          {
            error: r.message,
            code: r.code,
          },
          {
            status: r.status,
          },
        );
      return Response.json({
        ok: true,
      });
    },
  ),
});

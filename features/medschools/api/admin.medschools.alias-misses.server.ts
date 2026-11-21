import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { listAliasMissesApi } from '@features/medschools/medschools.contract';
import type { MedPrisma } from '../scrape/types';
import { listAliasMisses } from './alias-admin.server';

/** GET /api/admin/medschools/alias-misses — unresolved source names plus the schools to map them to. */
export const route = apiRoute('/api/admin/medschools/alias-misses', {
  GET: implement(
    listAliasMissesApi,
    {
      auth: 'admin',
      rateLimit: 'read',
    },
    async () => Response.json(await listAliasMisses(prisma as unknown as MedPrisma)),
  ),
});

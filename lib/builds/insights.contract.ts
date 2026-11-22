/** Contract for the build insights endpoint (client-safe; types by `import type`). */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { BuildInsightsDTO } from '@/lib/builds/insights';
import type { buildInsightsQuery } from '@/lib/builds/insights-schema';

/**
 * The build's owner, or a site admin (404 to anyone else, the same answer as a build that does not exist). `$id` is the
 * build's id or its slug. Counts per UTC day only; nobody is named. `Cache-Control: private, no-store`.
 */
export const getBuildInsightsApi = endpoint<{
  query: z.infer<typeof buildInsightsQuery>;
  res: BuildInsightsDTO;
}>()({ method: 'GET', path: '/api/user-builds/$id/insights' });

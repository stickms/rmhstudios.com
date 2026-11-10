/**
 * Contracts for /api/spaces (redesign audit C1). Client-safe: the body type comes
 * from the zod schema by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { createSpaceBody } from '@/lib/spaces/spaces-schema';
import type { LiveSpaceSummary, SpaceView } from '@/lib/spaces/types';

export const listLiveSpacesApi = endpoint<{ res: { spaces: LiveSpaceSummary[] } }>()({
  method: 'GET',
  path: '/api/spaces/live',
});

export const createSpaceApi = endpoint<{
  body: z.infer<typeof createSpaceBody>;
  res: { space: SpaceView };
}>()({ method: 'POST', path: '/api/spaces' });

export const startSpaceApi = endpoint<{ res: { space: SpaceView } }>()({
  method: 'POST',
  path: '/api/spaces/$id/start',
});

export const endSpaceApi = endpoint<{ res: { space: SpaceView } }>()({
  method: 'POST',
  path: '/api/spaces/$id/end',
});

/** Contract for the creator studio overview (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { StudioOverview } from '@/lib/creator/studio.server';

export const studioOverviewApi = endpoint<{ res: { overview: StudioOverview } }>()({
  method: 'GET',
  path: '/api/creator/studio-overview',
});

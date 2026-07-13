import { ashbyAdapter } from './ashby';
import { greenhouseAdapter } from './greenhouse';
import { leverAdapter } from './lever';
import { smartRecruitersAdapter } from './smartrecruiters';
import { workdayAdapter } from './workday';
import type { AdapterContext, NormalizedJob, SourceAdapter } from './types';

// Re-export types and utilities
export type { AdapterContext, NormalizedJob, SourceAdapter };
export { checkRobots } from './robots';
export { politeFetch, LADDER_USER_AGENT, type PoliteResponse } from './http';
export { verifyGenericUrl } from './generic';

export const ADAPTERS: Record<'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'workday', SourceAdapter> = {
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  ashby: ashbyAdapter,
  smartrecruiters: smartRecruitersAdapter,
  workday: workdayAdapter,
};

export function getAdapter(platform: string): SourceAdapter | null {
  if (platform in ADAPTERS) {
    return ADAPTERS[platform as keyof typeof ADAPTERS];
  }
  return null;
}

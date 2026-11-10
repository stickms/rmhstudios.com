/** Contracts for the new-account checklist (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { OnboardingClaimResult, OnboardingStatus } from '@/lib/onboarding.server';

export const getOnboardingApi = endpoint<{ res: OnboardingStatus & { reward: number } }>()({
  method: 'GET',
  path: '/api/onboarding',
});

export const claimOnboardingApi = endpoint<{
  res: { result: OnboardingClaimResult; claimed: boolean; reward: number };
}>()({ method: 'POST', path: '/api/onboarding' });

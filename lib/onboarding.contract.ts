/** Contracts for the new-account checklist (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type {
  FirstWeekGraduationResult,
  OnboardingClaimResult,
  OnboardingStatus,
} from '@/lib/onboarding.server';

export const getOnboardingApi =
  endpoint<{
    res: OnboardingStatus & {
      reward: number;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/onboarding',
    },
  );

export const claimOnboardingApi =
  endpoint<{
    res: {
      result: OnboardingClaimResult;
      claimed: boolean;
      reward: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/onboarding',
    },
  );

/** Claim the First Week graduation reward once every step is done. */
export const claimFirstWeekApi =
  endpoint<{
    res: {
      result: FirstWeekGraduationResult;
      graduated: boolean;
      reward: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/onboarding/first-week',
    },
  );

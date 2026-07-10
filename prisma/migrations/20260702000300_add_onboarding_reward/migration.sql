-- First-run onboarding checklist reward claim timestamp
ALTER TABLE "user_profile" ADD COLUMN "onboardingRewardedAt" TIMESTAMP(3);

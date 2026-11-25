-- A deletion request ends the membership too (s12-18): the Stripe subscription ids the request set to cancel at the
-- period's end, so signing back in resumes exactly those. Additive, defaults to none.
ALTER TABLE "deletion_hold" ADD COLUMN "subscriptionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

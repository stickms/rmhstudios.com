-- s13-18: a deletion request or its withdrawal clears this; the billing sync stamps it when Stripe matches the member's
-- current choice. A null stamp is what the hourly reconcile sweep queues. A done-stamp only, never a claim.
ALTER TABLE "deletion_hold" ADD COLUMN "billingSyncedAt" TIMESTAMP(3);

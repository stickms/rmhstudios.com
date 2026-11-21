-- Feedback inbox (s06-05): status, outcome, internal note, one reply and its once-only notification claim, and the
-- assistive technology an accessibility report names. All columns are nullable or defaulted; existing rows read as new.
ALTER TABLE "feedback" ADD COLUMN     "adminNote" VARCHAR(1000),
ADD COLUMN     "assistiveTech" VARCHAR(24),
ADD COLUMN     "handledById" TEXT,
ADD COLUMN     "outcome" VARCHAR(20),
ADD COLUMN     "repliedAt" TIMESTAMP(3),
ADD COLUMN     "reply" VARCHAR(1000),
ADD COLUMN     "replyNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "status" VARCHAR(12) NOT NULL DEFAULT 'new',
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- Content warnings + reply controls for posts (and drafts/scheduled posts).
CREATE TYPE "RMHarkReplyControl" AS ENUM ('EVERYONE', 'FOLLOWING', 'MENTIONED');

ALTER TABLE "rmheet"
  ADD COLUMN "isSensitive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "replyControl" "RMHarkReplyControl" NOT NULL DEFAULT 'EVERYONE';

ALTER TABLE "scheduled_post"
  ADD COLUMN "isSensitive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "replyControl" "RMHarkReplyControl" NOT NULL DEFAULT 'EVERYONE';

-- Feature batch: recycle bin, bulk ops, account recovery, message edit/unsend
-- + voice notes, typing analytics, verified profile links, handle history,
-- speedruns, and the RMHLadder answer bank.

-- ── Recycle bin: who deleted it. Only 'author' is restorable. ───────────────
ALTER TABLE "rmhark" ADD COLUMN "deletedBy" VARCHAR(12);
ALTER TABLE "rmhark_comment" ADD COLUMN "deletedBy" VARCHAR(12);

-- ── Messages: edit, unsend, voice notes. ───────────────────────────────────
ALTER TABLE "direct_message" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "direct_message" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "direct_message" ADD COLUMN "deletedBy" VARCHAR(12);
ALTER TABLE "direct_message" ADD COLUMN "audioUrl" VARCHAR(500);
ALTER TABLE "direct_message" ADD COLUMN "audioDurationMs" INTEGER;
ALTER TABLE "direct_message" ADD COLUMN "audioPeaks" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[];

ALTER TABLE "group_message" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "group_message" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "group_message" ADD COLUMN "deletedBy" VARCHAR(12);
ALTER TABLE "group_message" ADD COLUMN "audioUrl" VARCHAR(500);
ALTER TABLE "group_message" ADD COLUMN "audioDurationMs" INTEGER;
ALTER TABLE "group_message" ADD COLUMN "audioPeaks" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[];

CREATE TABLE "direct_message_hide" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "direct_message_hide_pkey" PRIMARY KEY ("messageId","userId")
);
CREATE INDEX "direct_message_hide_userId_idx" ON "direct_message_hide"("userId");
ALTER TABLE "direct_message_hide" ADD CONSTRAINT "direct_message_hide_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Bulk operations. ───────────────────────────────────────────────────────
CREATE TABLE "bulk_operation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "filter" JSONB NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "bulk_operation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bulk_operation_userId_createdAt_idx" ON "bulk_operation"("userId", "createdAt" DESC);
CREATE INDEX "bulk_operation_status_createdAt_idx" ON "bulk_operation"("status", "createdAt");
ALTER TABLE "bulk_operation" ADD CONSTRAINT "bulk_operation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Account recovery. ──────────────────────────────────────────────────────
CREATE TABLE "recovery_code" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" VARCHAR(200) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recovery_code_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "recovery_code_userId_idx" ON "recovery_code"("userId");
ALTER TABLE "recovery_code" ADD CONSTRAINT "recovery_code_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "trusted_contact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trusted_contact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "trusted_contact_userId_contactId_key" ON "trusted_contact"("userId", "contactId");
CREATE INDEX "trusted_contact_contactId_idx" ON "trusted_contact"("contactId");
ALTER TABLE "trusted_contact" ADD CONSTRAINT "trusted_contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trusted_contact" ADD CONSTRAINT "trusted_contact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "recovery_request" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    "approvals" INTEGER NOT NULL DEFAULT 0,
    "approvedBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tokenHash" VARCHAR(200) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recovery_request_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "recovery_request_userId_createdAt_idx" ON "recovery_request"("userId", "createdAt" DESC);
CREATE INDEX "recovery_request_status_expiresAt_idx" ON "recovery_request"("status", "expiresAt");
ALTER TABLE "recovery_request" ADD CONSTRAINT "recovery_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Typing analytics. Aggregate only, per single key, never ordered. ────────
CREATE TABLE "rmhtype_key_stat" (
    "userId" TEXT NOT NULL,
    "key" VARCHAR(4) NOT NULL,
    "layout" VARCHAR(16) NOT NULL DEFAULT 'qwerty',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "totalMs" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rmhtype_key_stat_pkey" PRIMARY KEY ("userId","key","layout")
);
ALTER TABLE "rmhtype_key_stat" ADD CONSTRAINT "rmhtype_key_stat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Verified profile links + handle history. ───────────────────────────────
CREATE TABLE "profile_link" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" VARCHAR(300) NOT NULL,
    "label" VARCHAR(60),
    "position" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "host" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "profile_link_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "profile_link_userId_position_idx" ON "profile_link"("userId", "position");
CREATE INDEX "profile_link_host_idx" ON "profile_link"("host");
ALTER TABLE "profile_link" ADD CONSTRAINT "profile_link_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "handle_change" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "oldHandle" VARCHAR(30) NOT NULL,
    "newHandle" VARCHAR(30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "handle_change_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "handle_change_userId_createdAt_idx" ON "handle_change"("userId", "createdAt" DESC);
CREATE INDEX "handle_change_oldHandle_idx" ON "handle_change"("oldHandle");
ALTER TABLE "handle_change" ADD CONSTRAINT "handle_change_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Speedruns. Leaderboards are per game version. ──────────────────────────
CREATE TABLE "speedrun_category" (
    "id" TEXT NOT NULL,
    "game" VARCHAR(32) NOT NULL,
    "slug" VARCHAR(32) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "rules" VARCHAR(2000) NOT NULL,
    "metric" VARCHAR(12) NOT NULL DEFAULT 'time',
    "version" VARCHAR(16) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "speedrun_category_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "speedrun_category_game_slug_version_key" ON "speedrun_category"("game", "slug", "version");
CREATE INDEX "speedrun_category_game_active_idx" ON "speedrun_category"("game", "active");

CREATE TABLE "speedrun_entry" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "replayId" TEXT NOT NULL,
    "timeMs" INTEGER NOT NULL,
    "score" INTEGER,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "rejectReason" VARCHAR(200),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "speedrun_entry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "speedrun_entry_replayId_key" ON "speedrun_entry"("replayId");
CREATE INDEX "speedrun_entry_categoryId_status_timeMs_idx" ON "speedrun_entry"("categoryId", "status", "timeMs");
CREATE INDEX "speedrun_entry_userId_createdAt_idx" ON "speedrun_entry"("userId", "createdAt" DESC);
ALTER TABLE "speedrun_entry" ADD CONSTRAINT "speedrun_entry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "speedrun_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "speedrun_entry" ADD CONSTRAINT "speedrun_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RMHLadder answer bank. Sensitive personal data — must be covered by the
--    account export and delete flows.
CREATE TABLE "ladder_answer_bank" (
    "userId" TEXT NOT NULL,
    "workAuthorization" VARCHAR(120),
    "needsSponsorship" BOOLEAN,
    "noticePeriod" VARCHAR(60),
    "salaryExpectation" VARCHAR(60),
    "locationPreference" VARCHAR(120),
    "linkedinUrl" VARCHAR(300),
    "portfolioUrl" VARCHAR(300),
    "essays" JSONB NOT NULL DEFAULT '[]',
    "stories" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ladder_answer_bank_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "ladder_answer_bank" ADD CONSTRAINT "ladder_answer_bank_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

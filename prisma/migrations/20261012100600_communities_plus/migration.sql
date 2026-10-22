-- P06 communities-plus (N1-N8, S2): flair, starboard, onboarding, AutoMod + mod queue, challenges, census, contributors, sister communities.
-- Additive only: new tables and new defaulted/nullable columns on community and community_member.
-- AlterTable
ALTER TABLE "community" ADD COLUMN     "flairRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "starThreshold" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "verificationLevel" VARCHAR(16) NOT NULL DEFAULT 'none',
ADD COLUMN     "verificationValue" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "community_member" ADD COLUMN     "followedFlairIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "roleTags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "community_flair" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "name" VARCHAR(24) NOT NULL,
    "color" VARCHAR(12) NOT NULL DEFAULT 'accent',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_flair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_post_flair" (
    "postId" TEXT NOT NULL,
    "flairId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_post_flair_pkey" PRIMARY KEY ("postId")
);

-- CreateTable
CREATE TABLE "community_star_post" (
    "postId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "starCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_star_post_pkey" PRIMARY KEY ("postId")
);

-- CreateTable
CREATE TABLE "community_onboarding_question" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "prompt" VARCHAR(140) NOT NULL,
    "options" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_onboarding_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_onboarding_answer" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionId" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_onboarding_answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_automod_rule" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "appliesTo" VARCHAR(8) NOT NULL DEFAULT 'both',
    "action" VARCHAR(8) NOT NULL,
    "conditions" JSONB NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_automod_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_mod_item" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "entityType" VARCHAR(8) NOT NULL,
    "entityId" VARCHAR(64),
    "postId" VARCHAR(64),
    "authorId" TEXT NOT NULL,
    "action" VARCHAR(8) NOT NULL,
    "ruleName" VARCHAR(60) NOT NULL,
    "snapshot" VARCHAR(300) NOT NULL,
    "payload" JSONB,
    "status" VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_mod_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_challenge" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "prompt" VARCHAR(1000) NOT NULL,
    "submitEndsAt" TIMESTAMP(3) NOT NULL,
    "voteEndsAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "winnerEntryId" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_challenge_entry" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_challenge_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_challenge_vote" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_challenge_vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_census" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "questions" JSONB NOT NULL,
    "closesAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "responseCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_census_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_census_participant" (
    "censusId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_census_participant_pkey" PRIMARY KEY ("censusId","userId")
);

-- CreateTable
CREATE TABLE "community_census_tally" (
    "censusId" TEXT NOT NULL,
    "questionId" VARCHAR(24) NOT NULL,
    "optionId" VARCHAR(24) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "community_census_tally_pkey" PRIMARY KEY ("censusId","questionId","optionId")
);

-- CreateTable
CREATE TABLE "community_contributor_score" (
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "starPosts" INTEGER NOT NULL DEFAULT 0,
    "challengeWins" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_contributor_score_pkey" PRIMARY KEY ("communityId","userId")
);

-- CreateTable
CREATE TABLE "community_sister" (
    "communityId" TEXT NOT NULL,
    "relatedCommunityId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_sister_pkey" PRIMARY KEY ("communityId","relatedCommunityId")
);

-- CreateIndex
CREATE INDEX "community_flair_communityId_position_idx" ON "community_flair"("communityId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "community_flair_communityId_name_key" ON "community_flair"("communityId", "name");

-- CreateIndex
CREATE INDEX "community_post_flair_flairId_idx" ON "community_post_flair"("flairId");

-- CreateIndex
CREATE INDEX "community_star_post_communityId_starCount_idx" ON "community_star_post"("communityId", "starCount" DESC);

-- CreateIndex
CREATE INDEX "community_onboarding_question_communityId_position_idx" ON "community_onboarding_question"("communityId", "position");

-- CreateIndex
CREATE INDEX "community_onboarding_answer_communityId_userId_idx" ON "community_onboarding_answer"("communityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "community_onboarding_answer_questionId_userId_key" ON "community_onboarding_answer"("questionId", "userId");

-- CreateIndex
CREATE INDEX "community_automod_rule_communityId_position_idx" ON "community_automod_rule"("communityId", "position");

-- CreateIndex
CREATE INDEX "community_mod_item_communityId_status_createdAt_idx" ON "community_mod_item"("communityId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "community_mod_item_authorId_idx" ON "community_mod_item"("authorId");

-- CreateIndex
CREATE INDEX "community_challenge_communityId_createdAt_idx" ON "community_challenge"("communityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "community_challenge_finalizedAt_voteEndsAt_idx" ON "community_challenge"("finalizedAt", "voteEndsAt");

-- CreateIndex
CREATE INDEX "community_challenge_entry_challengeId_voteCount_idx" ON "community_challenge_entry"("challengeId", "voteCount" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "community_challenge_entry_challengeId_userId_key" ON "community_challenge_entry"("challengeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "community_challenge_entry_postId_key" ON "community_challenge_entry"("postId");

-- CreateIndex
CREATE INDEX "community_challenge_vote_entryId_idx" ON "community_challenge_vote"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "community_challenge_vote_challengeId_userId_key" ON "community_challenge_vote"("challengeId", "userId");

-- CreateIndex
CREATE INDEX "community_census_communityId_createdAt_idx" ON "community_census"("communityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "community_census_participant_userId_idx" ON "community_census_participant"("userId");

-- CreateIndex
CREATE INDEX "community_contributor_score_communityId_score_idx" ON "community_contributor_score"("communityId", "score" DESC);

-- CreateIndex
CREATE INDEX "community_sister_relatedCommunityId_idx" ON "community_sister"("relatedCommunityId");

-- AddForeignKey
ALTER TABLE "community_flair" ADD CONSTRAINT "community_flair_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_post_flair" ADD CONSTRAINT "community_post_flair_postId_fkey" FOREIGN KEY ("postId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_post_flair" ADD CONSTRAINT "community_post_flair_flairId_fkey" FOREIGN KEY ("flairId") REFERENCES "community_flair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_star_post" ADD CONSTRAINT "community_star_post_postId_fkey" FOREIGN KEY ("postId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_star_post" ADD CONSTRAINT "community_star_post_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_onboarding_question" ADD CONSTRAINT "community_onboarding_question_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_onboarding_answer" ADD CONSTRAINT "community_onboarding_answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "community_onboarding_question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_onboarding_answer" ADD CONSTRAINT "community_onboarding_answer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_automod_rule" ADD CONSTRAINT "community_automod_rule_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_mod_item" ADD CONSTRAINT "community_mod_item_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_mod_item" ADD CONSTRAINT "community_mod_item_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_challenge" ADD CONSTRAINT "community_challenge_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_challenge_entry" ADD CONSTRAINT "community_challenge_entry_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "community_challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_challenge_entry" ADD CONSTRAINT "community_challenge_entry_postId_fkey" FOREIGN KEY ("postId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_challenge_entry" ADD CONSTRAINT "community_challenge_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_challenge_vote" ADD CONSTRAINT "community_challenge_vote_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "community_challenge_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_challenge_vote" ADD CONSTRAINT "community_challenge_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_census" ADD CONSTRAINT "community_census_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_census_participant" ADD CONSTRAINT "community_census_participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_contributor_score" ADD CONSTRAINT "community_contributor_score_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_contributor_score" ADD CONSTRAINT "community_contributor_score_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_sister" ADD CONSTRAINT "community_sister_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_sister" ADD CONSTRAINT "community_sister_relatedCommunityId_fkey" FOREIGN KEY ("relatedCommunityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;


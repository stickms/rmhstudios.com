-- AlterTable
ALTER TABLE "rmheet" ADD COLUMN     "hasEmbed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "studio_challenge" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "brief" VARCHAR(1000) NOT NULL,
    "sampleKey" VARCHAR(200) NOT NULL,
    "sampleName" VARCHAR(120) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "votingEndsAt" TIMESTAMP(3) NOT NULL,
    "winnerId" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_challenge_entry" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "linkUrl" VARCHAR(500),
    "audioKey" VARCHAR(200),
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_challenge_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_challenge_vote" (
    "challengeId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_challenge_vote_pkey" PRIMARY KEY ("challengeId","voterId")
);

-- CreateTable
CREATE TABLE "post_code_embed" (
    "postId" TEXT NOT NULL,
    "html" VARCHAR(10000) NOT NULL,
    "css" VARCHAR(10000) NOT NULL,
    "js" VARCHAR(10000) NOT NULL,

    CONSTRAINT "post_code_embed_pkey" PRIMARY KEY ("postId")
);

-- CreateIndex
CREATE INDEX "studio_challenge_startsAt_idx" ON "studio_challenge"("startsAt" DESC);

-- CreateIndex
CREATE INDEX "studio_challenge_entry_challengeId_voteCount_idx" ON "studio_challenge_entry"("challengeId", "voteCount" DESC);

-- CreateIndex
CREATE INDEX "studio_challenge_entry_userId_idx" ON "studio_challenge_entry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "studio_challenge_entry_challengeId_userId_key" ON "studio_challenge_entry"("challengeId", "userId");

-- CreateIndex
CREATE INDEX "studio_challenge_vote_entryId_idx" ON "studio_challenge_vote"("entryId");

-- CreateIndex
CREATE INDEX "studio_challenge_vote_voterId_idx" ON "studio_challenge_vote"("voterId");

-- AddForeignKey
ALTER TABLE "studio_challenge_entry" ADD CONSTRAINT "studio_challenge_entry_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "studio_challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_challenge_entry" ADD CONSTRAINT "studio_challenge_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_challenge_vote" ADD CONSTRAINT "studio_challenge_vote_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "studio_challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_challenge_vote" ADD CONSTRAINT "studio_challenge_vote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_challenge_vote" ADD CONSTRAINT "studio_challenge_vote_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "studio_challenge_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_code_embed" ADD CONSTRAINT "post_code_embed_postId_fkey" FOREIGN KEY ("postId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;


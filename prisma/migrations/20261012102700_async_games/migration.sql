-- CreateTable
CREATE TABLE "gabriels_horn_table_read" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "games" INTEGER NOT NULL DEFAULT 0,
    "claims" INTEGER NOT NULL DEFAULT 0,
    "lies" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "callsCorrect" INTEGER NOT NULL DEFAULT 0,
    "lieClaimMs" INTEGER NOT NULL DEFAULT 0,
    "truthClaimMs" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gabriels_horn_table_read_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "velum_contract" (
    "id" TEXT NOT NULL,
    "pickupX" INTEGER NOT NULL,
    "pickupZ" INTEGER NOT NULL,
    "dropX" INTEGER NOT NULL,
    "dropZ" INTEGER NOT NULL,
    "creatorId" TEXT NOT NULL,
    "holderId" TEXT,
    "bestCentis" INTEGER NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordSetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "velum_contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versecraft_seed_listing" (
    "id" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "authorId" TEXT NOT NULL,
    "ratingSum" INTEGER NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versecraft_seed_listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versecraft_seed_rating" (
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versecraft_seed_rating_pkey" PRIMARY KEY ("listingId","userId")
);

-- CreateTable
CREATE TABLE "march_signal" (
    "id" TEXT NOT NULL,
    "siteId" VARCHAR(40) NOT NULL,
    "authorId" TEXT NOT NULL,
    "template" VARCHAR(24) NOT NULL,
    "param" VARCHAR(16) NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "march_signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "march_signal_vote" (
    "signalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "march_signal_vote_pkey" PRIMARY KEY ("signalId","userId")
);

-- CreateTable
CREATE TABLE "nightrail_trick" (
    "id" TEXT NOT NULL,
    "week" VARCHAR(10) NOT NULL,
    "authorId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "chain" TEXT[],
    "votes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nightrail_trick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nightrail_trick_vote" (
    "trickId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "week" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nightrail_trick_vote_pkey" PRIMARY KEY ("trickId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "gabriels_horn_table_read_userId_key" ON "gabriels_horn_table_read"("userId");

-- CreateIndex
CREATE INDEX "velum_contract_recordSetAt_idx" ON "velum_contract"("recordSetAt" DESC);

-- CreateIndex
CREATE INDEX "velum_contract_creatorId_idx" ON "velum_contract"("creatorId");

-- CreateIndex
CREATE INDEX "velum_contract_holderId_idx" ON "velum_contract"("holderId");

-- CreateIndex
CREATE UNIQUE INDEX "velum_contract_pickupX_pickupZ_dropX_dropZ_key" ON "velum_contract"("pickupX", "pickupZ", "dropX", "dropZ");

-- CreateIndex
CREATE UNIQUE INDEX "versecraft_seed_listing_seed_key" ON "versecraft_seed_listing"("seed");

-- CreateIndex
CREATE INDEX "versecraft_seed_listing_createdAt_idx" ON "versecraft_seed_listing"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "versecraft_seed_listing_authorId_idx" ON "versecraft_seed_listing"("authorId");

-- CreateIndex
CREATE INDEX "versecraft_seed_rating_userId_idx" ON "versecraft_seed_rating"("userId");

-- CreateIndex
CREATE INDEX "march_signal_siteId_score_idx" ON "march_signal"("siteId", "score" DESC);

-- CreateIndex
CREATE INDEX "march_signal_authorId_idx" ON "march_signal"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "march_signal_siteId_authorId_template_param_key" ON "march_signal"("siteId", "authorId", "template", "param");

-- CreateIndex
CREATE INDEX "march_signal_vote_userId_idx" ON "march_signal_vote"("userId");

-- CreateIndex
CREATE INDEX "nightrail_trick_week_votes_idx" ON "nightrail_trick"("week", "votes" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "nightrail_trick_week_authorId_key" ON "nightrail_trick"("week", "authorId");

-- CreateIndex
CREATE INDEX "nightrail_trick_vote_userId_idx" ON "nightrail_trick_vote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "nightrail_trick_vote_week_userId_key" ON "nightrail_trick_vote"("week", "userId");

-- AddForeignKey
ALTER TABLE "gabriels_horn_table_read" ADD CONSTRAINT "gabriels_horn_table_read_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "velum_contract" ADD CONSTRAINT "velum_contract_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "velum_contract" ADD CONSTRAINT "velum_contract_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versecraft_seed_listing" ADD CONSTRAINT "versecraft_seed_listing_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versecraft_seed_listing" ADD CONSTRAINT "versecraft_seed_listing_seed_fkey" FOREIGN KEY ("seed") REFERENCES "versecraft_world"("seed") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versecraft_seed_rating" ADD CONSTRAINT "versecraft_seed_rating_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "versecraft_seed_listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versecraft_seed_rating" ADD CONSTRAINT "versecraft_seed_rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "march_signal" ADD CONSTRAINT "march_signal_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "march_signal_vote" ADD CONSTRAINT "march_signal_vote_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "march_signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "march_signal_vote" ADD CONSTRAINT "march_signal_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nightrail_trick" ADD CONSTRAINT "nightrail_trick_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nightrail_trick_vote" ADD CONSTRAINT "nightrail_trick_vote_trickId_fkey" FOREIGN KEY ("trickId") REFERENCES "nightrail_trick"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nightrail_trick_vote" ADD CONSTRAINT "nightrail_trick_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


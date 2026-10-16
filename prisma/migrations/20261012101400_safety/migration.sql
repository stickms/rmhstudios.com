-- CreateTable
CREATE TABLE "mod_macro" (
    "id" TEXT NOT NULL,
    "communityId" TEXT,
    "createdById" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mod_macro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_domain_rule" (
    "domain" VARCHAR(255) NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "note" VARCHAR(200),
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_domain_rule_pkey" PRIMARY KEY ("domain")
);

-- CreateTable
CREATE TABLE "seen_link_domain" (
    "domain" VARCHAR(255) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seen_link_domain_pkey" PRIMARY KEY ("domain")
);

-- CreateTable
CREATE TABLE "pile_on_guard" (
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "previousControl" "RMHarkReplyControl" NOT NULL DEFAULT 'EVERYONE',
    "status" VARCHAR(12) NOT NULL,
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "pile_on_guard_pkey" PRIMARY KEY ("postId")
);

-- CreateIndex
CREATE INDEX "mod_macro_communityId_createdAt_idx" ON "mod_macro"("communityId", "createdAt");

-- CreateIndex
CREATE INDEX "pile_on_guard_authorId_idx" ON "pile_on_guard"("authorId");

-- CreateIndex
CREATE INDEX "pile_on_guard_status_expiresAt_idx" ON "pile_on_guard"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "pile_on_guard" ADD CONSTRAINT "pile_on_guard_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


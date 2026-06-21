-- Add indexes on hot foreign keys that were previously unindexed.
-- session.userId and account.userId are joined on every authenticated request;
-- the account (providerId, accountId) pair is looked up on every social login.
-- rmheet_comment gains a per-user feed index and a parent index for threads.

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "account_providerId_accountId_idx" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "rmheet_comment_userId_createdAt_idx" ON "rmheet_comment"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "rmheet_comment_parentId_idx" ON "rmheet_comment"("parentId");

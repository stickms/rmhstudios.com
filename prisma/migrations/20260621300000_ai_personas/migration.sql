-- CreateTable
CREATE TABLE "ai_persona" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "tagline" VARCHAR(120),
    "systemPrompt" VARCHAR(2000) NOT NULL,
    "greeting" VARCHAR(500),
    "emoji" VARCHAR(8),
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "chatCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_persona_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_persona_ownerId_idx" ON "ai_persona"("ownerId");
CREATE INDEX "ai_persona_isPublic_chatCount_idx" ON "ai_persona"("isPublic", "chatCount" DESC);
ALTER TABLE "ai_persona" ADD CONSTRAINT "ai_persona_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ai_persona_message" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" VARCHAR(12) NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_persona_message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_persona_message_personaId_userId_createdAt_idx" ON "ai_persona_message"("personaId", "userId", "createdAt");
ALTER TABLE "ai_persona_message" ADD CONSTRAINT "ai_persona_message_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ai_persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_persona_message" ADD CONSTRAINT "ai_persona_message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "note" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "content" TEXT NOT NULL DEFAULT '{}',
    "color" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockHash" TEXT,
    "folderId" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "moodEmoji" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_folder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "note_folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_tag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_tag_relation" (
    "noteId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "note_tag_relation_pkey" PRIMARY KEY ("noteId","tagId")
);

-- CreateTable
CREATE TABLE "note_reminder" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "repeatRule" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "note_reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_version" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_share" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_template" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isBuiltin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_mood" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "note" TEXT,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_mood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT 'Remote',
    "salaryRange" TEXT,
    "publishAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "outcome" TEXT,
    "processAt" TIMESTAMP(3),
    "rejectionMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "code" TEXT,
    "language" TEXT DEFAULT 'javascript',
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "evaluationResult" TEXT,
    "rejectionMessage" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "note_userId_idx" ON "note"("userId");

-- CreateIndex
CREATE INDEX "note_folderId_idx" ON "note"("folderId");

-- CreateIndex
CREATE INDEX "note_userId_isDeleted_idx" ON "note"("userId", "isDeleted");

-- CreateIndex
CREATE INDEX "note_userId_isArchived_idx" ON "note"("userId", "isArchived");

-- CreateIndex
CREATE INDEX "note_userId_isPinned_idx" ON "note"("userId", "isPinned");

-- CreateIndex
CREATE INDEX "note_folder_userId_idx" ON "note_folder"("userId");

-- CreateIndex
CREATE INDEX "note_folder_parentId_idx" ON "note_folder"("parentId");

-- CreateIndex
CREATE INDEX "note_tag_userId_idx" ON "note_tag"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "note_tag_userId_name_key" ON "note_tag"("userId", "name");

-- CreateIndex
CREATE INDEX "note_reminder_userId_idx" ON "note_reminder"("userId");

-- CreateIndex
CREATE INDEX "note_reminder_noteId_idx" ON "note_reminder"("noteId");

-- CreateIndex
CREATE INDEX "note_reminder_dueAt_idx" ON "note_reminder"("dueAt");

-- CreateIndex
CREATE INDEX "note_version_noteId_idx" ON "note_version"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "note_share_token_key" ON "note_share"("token");

-- CreateIndex
CREATE INDEX "note_share_noteId_idx" ON "note_share"("noteId");

-- CreateIndex
CREATE INDEX "note_template_userId_idx" ON "note_template"("userId");

-- CreateIndex
CREATE INDEX "note_mood_userId_idx" ON "note_mood"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "note_mood_userId_date_key" ON "note_mood"("userId", "date");

-- CreateIndex
CREATE INDEX "job_publishAt_idx" ON "job"("publishAt");

-- CreateIndex
CREATE INDEX "job_type_idx" ON "job"("type");

-- CreateIndex
CREATE INDEX "job_application_status_idx" ON "job_application"("status");

-- CreateIndex
CREATE INDEX "job_application_processAt_idx" ON "job_application"("processAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_application_userId_jobId_key" ON "job_application"("userId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_applicationId_key" ON "assessment"("applicationId");

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "note_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_folder" ADD CONSTRAINT "note_folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_folder" ADD CONSTRAINT "note_folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "note_folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_tag" ADD CONSTRAINT "note_tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_tag_relation" ADD CONSTRAINT "note_tag_relation_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_tag_relation" ADD CONSTRAINT "note_tag_relation_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "note_tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_reminder" ADD CONSTRAINT "note_reminder_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_version" ADD CONSTRAINT "note_version_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_share" ADD CONSTRAINT "note_share_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_template" ADD CONSTRAINT "note_template_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_mood" ADD CONSTRAINT "note_mood_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_application" ADD CONSTRAINT "job_application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_application" ADD CONSTRAINT "job_application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "job_application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

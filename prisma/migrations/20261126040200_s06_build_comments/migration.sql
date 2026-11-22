-- s06-14 build comments: the author edit and soft delete, the creator hide and the comment lock.
-- Additive: nullable columns and one defaulted boolean, plus the hider foreign key (set null on delete).
-- AlterTable
ALTER TABLE "user_build" ADD COLUMN     "commentsLocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "build_comment" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" VARCHAR(12),
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenById" TEXT;

-- AddForeignKey
ALTER TABLE "build_comment" ADD CONSTRAINT "build_comment_hiddenById_fkey" FOREIGN KEY ("hiddenById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;


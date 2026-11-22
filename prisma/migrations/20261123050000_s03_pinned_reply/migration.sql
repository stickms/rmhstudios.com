-- Pin one reply to the top of a post's conversation (author only); cleared when the
-- reply is hidden or deleted. No foreign key, so the column is a plain nullable add.

-- AlterTable
ALTER TABLE "rmheet" ADD COLUMN     "pinnedCommentId" VARCHAR(64);

-- Sprint 06 #17: account-wide defaults for direct-message read receipts and typing indicators.
-- Additive, defaulted columns on user_profile; existing conversation preferences are untouched.
-- AlterTable
ALTER TABLE "user_profile" ADD COLUMN     "readReceipts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "typingIndicators" BOOLEAN NOT NULL DEFAULT true;


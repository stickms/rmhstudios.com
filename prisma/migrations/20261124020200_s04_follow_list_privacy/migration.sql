-- Follow-list privacy: who may browse a member's followers and following lists
-- (everyone, mutuals or me). Existing rows keep today's behaviour: everyone.
-- AlterTable
ALTER TABLE "user_profile" ADD COLUMN     "followListVisibility" VARCHAR(10) NOT NULL DEFAULT 'everyone';


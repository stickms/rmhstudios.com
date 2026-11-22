-- Group chat admins (s07-04): a role on each chat member, "member" by default; "admin" is set by the owner.
-- One defaulted column, no index: the admin count is read under the group lock from at most 51 rows.
-- AlterTable
ALTER TABLE "chat_member" ADD COLUMN     "role" VARCHAR(8) NOT NULL DEFAULT 'member';


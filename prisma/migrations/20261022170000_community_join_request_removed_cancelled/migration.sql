-- Two more join-request states (see CommunityJoinRequestStatus in schema.prisma):
-- REMOVED marks a member a moderator removed, CANCELLED a request the user withdrew.
-- Additive: the old code never reads or writes them.
ALTER TYPE "CommunityJoinRequestStatus" ADD VALUE IF NOT EXISTS 'REMOVED';
ALTER TYPE "CommunityJoinRequestStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

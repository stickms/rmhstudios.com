-- Contract step for two tables retired in #1724.
-- rmh:contract-ok #1724 (deployed 2026-11-19, deploy run 1175) moved every reader
-- and writer off both tables and re-copied the bookmarks into saved_item; the
-- release now serving and this one never touch them.

-- rmheet_bookmark: folded into saved_item (entityType 'rmhark').
ALTER TABLE "rmheet_bookmark" DROP CONSTRAINT IF EXISTS "rmheet_bookmark_userId_fkey";
ALTER TABLE "rmheet_bookmark" DROP CONSTRAINT IF EXISTS "rmheet_bookmark_rmheetId_fkey";
DROP TABLE IF EXISTS "rmheet_bookmark";

-- read_position: its only writer (/api/history/position) and reader (the resume
-- rail's read-position source) were removed.
DROP TABLE IF EXISTS "read_position";

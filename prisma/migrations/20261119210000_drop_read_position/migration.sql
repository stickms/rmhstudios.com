-- ReadPosition was written only by /api/history/position, whose client hook
-- (hooks/useReadPosition.ts) was never mounted anywhere, and read only by the
-- resume rail. Both ends are removed, so the table goes too.
DROP TABLE IF EXISTS "read_position";

-- Partial index for the DM unread scan: WHERE conversationId IN (...) AND
-- senderId <> me AND read = false. Only unread rows are indexed, so the index
-- stays tiny (most messages are read) and unread lookups never scan read rows.
--
-- Hand-written (Prisma cannot express a partial index); NOT mirrored in
-- schema.prisma. Production `migrate deploy` applies it directly; a local
-- `migrate dev` / `db push` may propose a DROP — do not accept it.
CREATE INDEX IF NOT EXISTS "direct_message_unread_idx"
  ON "direct_message" ("conversationId", "senderId")
  WHERE "read" = false;

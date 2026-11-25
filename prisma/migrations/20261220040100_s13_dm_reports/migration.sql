-- s13-17: what a direct or group message said before an edit replaced it. One row per replaced version, written in the
-- edit's own transaction; read only by the moderation view of a reported message.
CREATE TABLE "chat_message_edit" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "replacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_edit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_message_edit_messageId_replacedAt_idx" ON "chat_message_edit"("messageId", "replacedAt");

ALTER TABLE "chat_message_edit" ADD CONSTRAINT "chat_message_edit_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

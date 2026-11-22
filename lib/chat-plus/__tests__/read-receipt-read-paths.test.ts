/**
 * Sprint 06 #17: every server path that hands a direct message's `read` flag back to its sender, or publishes a
 * read or typing event, must take its answer from `@/lib/chat-plus/receipts.server`. A new path is added to
 * `READ_RECEIPT_READ_PATHS` on purpose.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { READ_RECEIPT_READ_PATHS } from '@/lib/chat-plus/receipts';

const root = join(__dirname, '..', '..', '..');
const src = (rel: string) => readFileSync(join(root, rel), 'utf8');

/**
 * Files that mention `read: true` on a chat message but never report another member's read state to a sender:
 * they write the flag, return a just-created (unread) message, or mark the viewer's own unread rows read.
 */
const NOT_A_READ_PATH = new Set([
  'lib/messages/send.server.ts',
  'lib/messages/voice.server.ts',
  'lib/messages/requests.server.ts',
  'lib/messages/api/messages.read-all.server.ts',
  'lib/chat-plus/post.server.ts',
  'lib/chat-plus/apply-update.ts',
  'lib/rmhark-ai/bot-worker.server.ts',
]);

describe('READ_RECEIPT_READ_PATHS', () => {
  it('every listed file exists and takes its answer from the receipts module', () => {
    for (const rel of READ_RECEIPT_READ_PATHS) {
      expect(src(rel), `${rel} must import from @/lib/chat-plus/receipts.server`).toContain(
        "from '@/lib/chat-plus/receipts.server'",
      );
    }
  });

  it('message search masks `read` with receiptsHiddenFor', () => {
    const text = src('lib/messages/api/messages.search.server.ts');
    expect(text).toContain('receiptsHiddenFor(');
    expect(text).toMatch(/receiptsHidden\.has\(conv\.id\)/);
  });

  it('the read and typing endpoints consult the pair privacy before publishing', () => {
    for (const rel of [
      'lib/messages/api/messages.$conversationId.read.server.ts',
      'lib/messages/api/messages.$conversationId.typing.server.ts',
    ]) {
      expect(src(rel)).toContain('getPairPrivacy(');
    }
  });

  it('no other file selects `read` on chat messages without being listed', () => {
    const files = execSync(`grep -rlE "read: true" app lib features server --include=*.ts --include=*.tsx`, {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((f) => f && !/__tests__|\.test\./.test(f))
      .filter((f) => /chatMessage|chat_message|messages: \{/.test(src(f)));
    const known = new Set<string>([...READ_RECEIPT_READ_PATHS, ...NOT_A_READ_PATH]);
    const unknown = files.filter((f) => !known.has(f));
    expect(unknown, 'a new reader of ChatMessage.read must be added to READ_RECEIPT_READ_PATHS (gated)').toEqual([]);
  });

  it('uses the real table and column names for the account switches', () => {
    expect(src('prisma/schema/profile.prisma')).toMatch(
      /model UserProfile \{[\s\S]*?readReceipts\s+Boolean\s+@default\(true\)[\s\S]*?typingIndicators\s+Boolean\s+@default\(true\)[\s\S]*?@@map\("user_profile"\)/,
    );
    expect(src('prisma/migrations/20261126050100_s06_read_receipts/migration.sql')).toContain(
      'ALTER TABLE "user_profile" ADD COLUMN     "readReceipts" BOOLEAN NOT NULL DEFAULT true',
    );
  });
});

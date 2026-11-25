import { describe, expect, it } from 'vitest';
import { applyChatUpdate } from '@/lib/chat-plus/apply-update';

describe('applyChatUpdate: removed (s13-17)', () => {
  it('drops the one message a moderator removed and keeps the rest', () => {
    const messages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const next = applyChatUpdate(messages, { kind: 'group', chatId: 'g', op: 'removed', messageId: 'b' }, 'viewer');
    expect(next.map((m) => m.id)).toEqual(['a', 'c']);
  });
});

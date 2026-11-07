import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    notificationPreference: { findUnique: vi.fn() },
    userBlock: { findFirst: vi.fn() },
    callMute: { findFirst: vi.fn() },
    follow: { findFirst: vi.fn() },
    conversation: { upsert: vi.fn() },
    directMessage: { findFirst: vi.fn() },
  },
  aiChat: vi.fn(),
  isAITextConfigured: vi.fn(),
  getChatAccess: vi.fn(),
  postChatMessage: vi.fn(),
  canDirectMessage: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/ai/text.server', () => ({
  aiChat: mocks.aiChat,
  isAITextConfigured: mocks.isAITextConfigured,
}));
vi.mock('@/lib/chat-plus/access.server', () => ({ getChatAccess: mocks.getChatAccess }));
vi.mock('@/lib/chat-plus/post.server', () => ({ postChatMessage: mocks.postChatMessage }));
vi.mock('@/lib/chat-plus/dm-privacy.server', () => ({ canDirectMessage: mocks.canDirectMessage }));

import { sendCallAutoReply } from '@/lib/call/auto-reply.server';
import { AUTO_REPLY_PREFIX } from '@/lib/call/answer';

const CALLER = 'user-caller';
const CALLEE = 'user-callee';

/** Defaults: callee wants replies, caller may ring, nothing in the way. */
function arrange(over: {
  mode?: string;
  privacy?: string;
  note?: string | null;
  blocked?: boolean;
  muted?: boolean;
  calleeFollows?: boolean;
  callerFollows?: boolean;
  dmAllowed?: boolean;
  recent?: boolean;
  ai?: 'off' | 'ok' | 'fail' | 'link';
} = {}) {
  mocks.prisma.notificationPreference.findUnique.mockResolvedValue({
    callAnswerMode: over.mode ?? 'ring_reply',
    callBusyNote: over.note ?? null,
    callPrivacy: over.privacy ?? 'everyone',
  });
  mocks.prisma.userBlock.findFirst.mockResolvedValue(over.blocked ? { blockerId: CALLEE } : null);
  mocks.prisma.callMute.findFirst.mockResolvedValue(over.muted ? { id: 'm' } : null);
  mocks.prisma.follow.findFirst.mockImplementation(
    async ({ where }: { where: { followerId: string } }) => {
      const follows = where.followerId === CALLEE ? over.calleeFollows : over.callerFollows;
      return follows ? { followerId: where.followerId } : null;
    },
  );
  mocks.canDirectMessage.mockResolvedValue(over.dmAllowed ?? true);
  mocks.prisma.conversation.upsert.mockResolvedValue({ id: 'conv-1' });
  mocks.prisma.directMessage.findFirst.mockResolvedValue(over.recent ? { id: 'old' } : null);
  mocks.getChatAccess.mockResolvedValue({ kind: 'dm', id: 'conv-1' });
  mocks.postChatMessage.mockResolvedValue({ kind: 'dm', message: { id: 'msg-1' } });

  const ai = over.ai ?? 'off';
  mocks.isAITextConfigured.mockReturnValue(ai !== 'off');
  if (ai === 'ok') mocks.aiChat.mockResolvedValue('"I am in a meeting and will call back later."');
  if (ai === 'fail') mocks.aiChat.mockRejectedValue(new Error('upstream down'));
  if (ai === 'link') mocks.aiChat.mockResolvedValue('Reach me at https://evil.example/x');
}

beforeEach(() => {
  for (const group of Object.values(mocks.prisma)) {
    for (const fn of Object.values(group)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  mocks.aiChat.mockReset();
  mocks.isAITextConfigured.mockReset();
  mocks.getChatAccess.mockReset();
  mocks.postChatMessage.mockReset();
  mocks.canDirectMessage.mockReset();
});

const send = (trigger: 'busy' | 'missed' | 'unavailable' = 'busy') =>
  sendCallAutoReply({ callerId: CALLER, calleeId: CALLEE, trigger });

describe('who gets an automatic reply', () => {
  it('sends nothing when the callee did not ask for it', async () => {
    arrange({ mode: 'ring' });
    expect(await send()).toEqual({ sent: false, reason: 'mode' });
    expect(mocks.postChatMessage).not.toHaveBeenCalled();
    expect(mocks.prisma.conversation.upsert).not.toHaveBeenCalled();
    expect(mocks.aiChat).not.toHaveBeenCalled();
  });

  it('does not reply to a call the callee’s mode does not cover', async () => {
    arrange({ mode: 'ring_reply' });
    expect(await send('unavailable')).toEqual({ sent: false, reason: 'mode' });
  });

  it('never replies to a blocked caller, and does not even touch the writer', async () => {
    arrange({ blocked: true, ai: 'ok' });
    expect(await send()).toEqual({ sent: false, reason: 'not-permitted' });
    expect(mocks.aiChat).not.toHaveBeenCalled();
    expect(mocks.prisma.conversation.upsert).not.toHaveBeenCalled();
    expect(mocks.postChatMessage).not.toHaveBeenCalled();
  });

  it('never replies to a muted caller', async () => {
    arrange({ muted: true });
    expect(await send()).toEqual({ sent: false, reason: 'not-permitted' });
    expect(mocks.postChatMessage).not.toHaveBeenCalled();
  });

  it('never replies to someone outside the callee’s call privacy', async () => {
    arrange({ privacy: 'mutuals', calleeFollows: true, callerFollows: false });
    expect(await send()).toEqual({ sent: false, reason: 'not-permitted' });
    arrange({ privacy: 'nobody' });
    expect(await send()).toEqual({ sent: false, reason: 'not-permitted' });
    expect(mocks.postChatMessage).not.toHaveBeenCalled();
  });

  it('replies to a mutual under the default privacy', async () => {
    arrange({ privacy: 'mutuals', calleeFollows: true, callerFollows: true });
    expect(await send()).toEqual({ sent: true, messageId: 'msg-1' });
  });

  it('respects the caller’s own DM privacy', async () => {
    arrange({ dmAllowed: false });
    expect(await send()).toEqual({ sent: false, reason: 'dm-privacy' });
    expect(mocks.canDirectMessage).toHaveBeenCalledWith(CALLEE, CALLER);
    expect(mocks.postChatMessage).not.toHaveBeenCalled();
  });

  it('replies at most once per caller per cooldown', async () => {
    arrange({ recent: true });
    expect(await send()).toEqual({ sent: false, reason: 'cooldown' });
    expect(mocks.postChatMessage).not.toHaveBeenCalled();
    expect(mocks.prisma.directMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          senderId: CALLEE,
          meta: { path: ['autoReply'], equals: true },
        }),
      }),
    );
  });

  it('refuses a call to oneself', async () => {
    arrange();
    expect(await sendCallAutoReply({ callerId: CALLEE, calleeId: CALLEE, trigger: 'busy' })).toEqual({
      sent: false,
      reason: 'self',
    });
  });
});

describe('what is sent', () => {
  it('is labelled automatic, comes from the callee, and is flagged in meta', async () => {
    arrange({ ai: 'ok', note: 'in a meeting' });
    await send('busy');
    expect(mocks.postChatMessage).toHaveBeenCalledTimes(1);
    const [access, input] = mocks.postChatMessage.mock.calls[0];
    expect(access).toEqual({ kind: 'dm', id: 'conv-1' });
    expect(input.senderId).toBe(CALLEE);
    expect(input.content.startsWith(AUTO_REPLY_PREFIX)).toBe(true);
    expect(input.content).toContain('I am in a meeting and will call back later.');
    expect(input.meta).toEqual({ autoReply: true, trigger: 'busy' });
  });

  it('uses the normalised pair order for the conversation', async () => {
    arrange();
    await send();
    const where = mocks.prisma.conversation.upsert.mock.calls[0][0].where
      .participantOneId_participantTwoId;
    expect([where.participantOneId, where.participantTwoId]).toEqual(
      [CALLEE, CALLER].sort(),
    );
  });

  it('gives the writer only the callee’s note, never the caller', async () => {
    arrange({ ai: 'ok', note: 'at the dentist' });
    await send('missed');
    const [system, user] = mocks.aiChat.mock.calls[0];
    expect(user).toContain('at the dentist');
    expect(`${system}\n${user}`).not.toContain(CALLER);
  });

  it('falls back to a plain reply, with the note, when no writer is configured', async () => {
    arrange({ ai: 'off', note: 'back at 3' });
    await send('busy');
    expect(mocks.aiChat).not.toHaveBeenCalled();
    expect(mocks.postChatMessage.mock.calls[0][1].content).toBe(
      `${AUTO_REPLY_PREFIX}I'm on another call right now. back at 3`,
    );
  });

  it('falls back when the writer is down', async () => {
    arrange({ ai: 'fail' });
    expect(await send('missed')).toEqual({ sent: true, messageId: 'msg-1' });
    expect(mocks.postChatMessage.mock.calls[0][1].content).toContain("couldn't pick up");
  });

  it('falls back when the writer returns a link', async () => {
    arrange({ ai: 'link' });
    await send('busy');
    const content = mocks.postChatMessage.mock.calls[0][1].content as string;
    expect(content).not.toContain('evil.example');
    expect(content).toContain('another call');
  });
});

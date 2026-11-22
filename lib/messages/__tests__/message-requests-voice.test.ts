import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A voice note never opens or joins a message request (s04-16). */

const h = vi.hoisted(() => ({
  gate: { outcome: 'request', privacy: 'NONE' } as unknown,
  put: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/entitlements', () => ({ getUserTier: async () => 'free' }));
vi.mock('@/lib/storage/s3.server', () => ({ getObject: vi.fn(), putObject: h.put }));
vi.mock('@/lib/message-events', () => ({ notifyUser: vi.fn() }));
vi.mock('@/lib/chat-plus/post.server', () => ({ messageStamp: () => ({}) }));
vi.mock('@/lib/messages/mutations.server', () => ({
  loadParticipantConversation: async () => ({
    participantOneId: 'recipient',
    participantTwoId: 'sender',
    disappearAfterSec: null,
    request: null,
  }),
  otherParticipant: () => 'recipient',
}));
vi.mock('@/lib/messages/requests.server', () => ({
  requestGate: async () => h.gate,
  clearStaleDraft: async () => {},
}));

import { sendVoiceMessage } from '@/lib/messages/voice.server';

const send = () =>
  sendVoiceMessage({
    conversationId: 'chat1',
    userId: 'sender',
    buffer: Buffer.from('x'),
    contentType: 'audio/webm',
    durationMs: 1000,
    peaks: [],
  });

describe('voice notes and message requests', () => {
  beforeEach(() => h.put.mockClear());

  it('refuses a voice note where the sender could only ask', async () => {
    h.gate = { outcome: 'request', privacy: 'NONE' };
    expect(await send()).toMatchObject({ ok: false, status: 403 });
    expect(h.put).not.toHaveBeenCalled();
  });

  it('refuses a voice note into a pending request, and the plain privacy refusals as before', async () => {
    h.gate = { outcome: 'refused', reason: 'pending' };
    expect(await send()).toMatchObject({ ok: false, status: 403, error: expect.stringMatching(/waiting/) });
    h.gate = { outcome: 'refused', reason: 'NONE' };
    expect(await send()).toMatchObject({ ok: false, error: 'This user is no longer accepting messages.' });
    h.gate = { outcome: 'refused', reason: 'FOLLOWERS' };
    expect(await send()).toMatchObject({
      ok: false,
      error: 'This user only accepts messages from people they follow.',
    });
    expect(h.put).not.toHaveBeenCalled();
  });
});

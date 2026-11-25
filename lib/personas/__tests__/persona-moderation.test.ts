import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

/**
 * s12-16: a persona a moderator took down is private and stamped. It is a 404 to every other member's page and chat,
 * stays out of the public list, has no route that could make it public again, and its owner keeps it (page and chat).
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ personas: [] as Row[], listWhere: null as Row | null, replies: [] as string[] }));

const matches = (row: Row, where: Row): boolean => Object.entries(where).every(([k, v]) => row[k] === v);

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    aiPersona: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => h.personas.find((r) => matches(r, where)) ?? null),
      findMany: vi.fn(async ({ where }: { where: Row }) => {
        if ('isPublic' in where) h.listWhere = where;
        return h.personas.filter((r) => r.isPublic === where.isPublic);
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = h.personas.filter((r) => matches(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      }),
    },
    aiPersonaMessage: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock('@/lib/api/handler.server', () => ({ defineHandler: (_o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/api/implement.server', () => ({ implement: (_c: unknown, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/personas/chat.server', () => ({
  generatePersonaReply: vi.fn(async ({ userId }: { userId: string }) => {
    h.replies.push(userId);
    return 'hello';
  }),
}));

import { getPersonaChat } from '@/lib/persona-chat.server';
import { moderatePersona, personaReportAuthor, personaVisibleTo } from '@/lib/personas/moderation.server';

type Handler = (a: Record<string, unknown>) => Promise<Response>;

const chat = async (userId: string, id: string) => {
  const mod = await import('@/lib/personas/api/personas.$id.chat.server');
  return handlersOfModule<Handler>(mod).POST!({
    request: new Request('http://x/chat', { method: 'POST', body: JSON.stringify({ message: 'hi' }) }),
    params: { id },
    session: { user: { id: userId } },
  });
};

beforeEach(() => {
  h.personas = [
    {
      id: 'p1',
      ownerId: 'owner',
      name: 'Pip',
      tagline: null,
      greeting: null,
      emoji: null,
      avatarUrl: null,
      systemPrompt: 'be kind',
      isPublic: true,
      moderatedAt: null,
      chatCount: 0,
      owner: { id: 'owner', name: 'O', handle: 'o', image: null },
    },
  ];
  h.listWhere = null;
  h.replies = [];
});

describe('a moderated persona', () => {
  it('is 404 to other members’ pages, and the owner keeps theirs, told it was removed', async () => {
    expect((await getPersonaChat('p1', 'stranger'))?.persona.id).toBe('p1');
    await moderatePersona('p1');
    expect(h.personas[0]).toMatchObject({ isPublic: false, moderatedAt: expect.any(Date) });
    expect(await getPersonaChat('p1', 'stranger')).toBeNull();
    expect(await getPersonaChat('p1', null)).toBeNull();
    const mine = await getPersonaChat('p1', 'owner');
    expect(mine?.persona).toMatchObject({ id: 'p1', isOwner: true, removedByModerator: true });
  });

  it('is 404 to other members’ chats, even if the stamp outlived isPublic, and stays chat-able by its owner', async () => {
    await moderatePersona('p1');
    h.personas[0]!.isPublic = true;
    expect((await chat('stranger', 'p1')).status).toBe(404);
    expect(h.replies).toEqual([]);
    expect((await chat('owner', 'p1')).status).toBe(200);
    expect(h.replies).toEqual(['owner']);
  });

  it('is left out of the public list and cannot be reported again', async () => {
    await moderatePersona('p1');
    const mod = await import('@/lib/personas/api/personas.server');
    await handlersOfModule<Handler>(mod).GET!({ request: new Request('http://x/api/personas'), session: null });
    expect(h.listWhere).toMatchObject({ isPublic: true });
    expect(await personaReportAuthor('p1')).toBeNull();
  });

  it('has no route that edits a persona, so nothing can make it public again', async () => {
    const mod = await import('@/lib/personas/api/personas.$id.server');
    expect(Object.keys(handlersOfModule<Handler>(mod)).sort()).toEqual(['DELETE', 'GET']);
  });

  it('is visible to its owner only', () => {
    const row = { isPublic: false, moderatedAt: new Date(), ownerId: 'owner' };
    expect(personaVisibleTo(row, 'owner')).toBe(true);
    expect(personaVisibleTo(row, 'stranger')).toBe(false);
    expect(personaVisibleTo(row, null)).toBe(false);
    expect(personaVisibleTo({ ...row, isPublic: true }, 'stranger')).toBe(false);
  });
});

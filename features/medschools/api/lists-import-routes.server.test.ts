import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { compileRoutes } from '@/lib/api/route-match';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  importListItems: vi.fn(),
  parseListImport: vi.fn(),
  aiConfigured: vi.fn(() => true),
  findUser: vi.fn(async () => ({ bannedUntil: null as Date | null })),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/ai/provider.server', () => ({ isAiConfigured: mocks.aiConfigured }));
vi.mock('./lists.server', () => ({ importListItems: mocks.importListItems }));
vi.mock('./import/list-parse.server', async () => ({
  ...(await vi.importActual<typeof import('./import/list-parse.server')>('./import/list-parse.server')),
  parseListImport: mocks.parseListImport,
}));

import { route as parse } from './medschools.me.lists.import.parse.server';
import { route as save } from './medschools.me.lists.import.save.server';
import { route as listById } from './medschools.me.lists.$id.server';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const post = (route: unknown, body: BodyInit, type = 'application/json') =>
  handlersOf<Handler>(route).POST!({
    params: {},
    request: new Request('https://rmhstudios.com/api/medschools/me/lists/import/x', {
      method: 'POST',
      headers: { cookie: 'better-auth.session_token=t', 'content-type': type },
      body,
    }),
  });
const json = (route: unknown, body: unknown) => post(route, JSON.stringify(body));
const good = { target: { listId: 'l1' }, items: [{ slug: 'duke', program: 'ANY' }] };
const PREVIEW = { truncated: false, dropped: 0, rows: [], tier: 'free', remainingToday: 3, dailyCap: 5 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'u1' } });
  mocks.aiConfigured.mockReturnValue(true);
  mocks.findUser.mockResolvedValue({ bannedUntil: null });
  mocks.importListItems.mockResolvedValue({ list: { id: 'l1', name: 'L', position: 0, items: [] }, added: 1, alreadyThere: 0, invalid: 0 });
  mocks.parseListImport.mockResolvedValue(PREVIEW);
});

describe('me/lists/import routes', () => {
  it('both paths are their own routes, not the $id route (a static segment wins)', () => {
    const m = compileRoutes([
      { path: listById.path, value: 'id' },
      { path: parse.path, value: 'parse' },
      { path: save.path, value: 'save' },
    ]);
    expect(m.match('/api/medschools/me/lists/import/parse')?.value).toBe('parse');
    expect(m.match('/api/medschools/me/lists/import/save')?.value).toBe('save');
    expect(m.match('/api/medschools/me/lists/import')?.value).toBe('id');
  });

  it('signed out: both are 401 and nothing is called', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await json(parse, { text: 'Harvard' })).status).toBe(401);
    expect((await json(save, good)).status).toBe(401);
    expect(mocks.parseListImport).not.toHaveBeenCalled();
    expect(mocks.importListItems).not.toHaveBeenCalled();
  });

  it('parse: pasted text reaches the reader for the session user, and the answer is no-store', async () => {
    const res = await json(parse, { text: 'Harvard\nUCSF' });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(mocks.parseListImport.mock.calls[0]?.[0]).toMatchObject({
      userId: 'u1',
      input: { kind: 'paste', text: 'Harvard\nUCSF' },
    });
  });

  it('parse: a multipart file reaches the reader as bytes', async () => {
    const form = new FormData();
    form.append('file', new File(['Harvard'], 'list.txt', { type: 'text/plain' }));
    const req = new Request('https://x.invalid/', { method: 'POST', body: form });
    const res = await post(parse, await req.arrayBuffer(), req.headers.get('content-type')!);
    expect(res.status).toBe(200);
    const input = mocks.parseListImport.mock.calls[0]?.[0].input;
    expect(input).toMatchObject({ kind: 'file', mimeType: 'text/plain', filename: 'list.txt' });
    expect(input.buffer.toString()).toBe('Harvard');
  });

  it('parse: no AI key is a 503, a suspended account a 403, an unknown key or type a 400 / 415; none reaches the reader', async () => {
    mocks.aiConfigured.mockReturnValue(false);
    expect((await json(parse, { text: 'Harvard' })).status).toBe(503);
    mocks.aiConfigured.mockReturnValue(true);
    mocks.findUser.mockResolvedValue({ bannedUntil: new Date(Date.now() + 86_400_000) });
    expect((await json(parse, { text: 'Harvard' })).status).toBe(403);
    mocks.findUser.mockResolvedValue({ bannedUntil: null });
    expect((await json(parse, { text: 'Harvard', userId: 'b' })).status).toBe(400);
    const wrongType = await post(parse, 'Harvard', 'text/plain');
    expect(wrongType.status).toBe(415);
    expect(await wrongType.json()).toMatchObject({ code: 'MEDSCHOOLS_LIST_IMPORT_UNSUPPORTED' });
    expect(mocks.parseListImport).not.toHaveBeenCalled();
  });

  it('parse: an oversized body is refused in the list import words, never the tracker import "dates" sentence', async () => {
    const res = await json(parse, { text: 'x'.repeat(900_000) });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe('MEDSCHOOLS_LIST_IMPORT_TOO_LARGE');
    expect(body.error).not.toMatch(/date|tracker/i);
    expect(mocks.parseListImport).not.toHaveBeenCalled();
  });

  it('save: the body reaches the writer for the session user', async () => {
    const res = await json(save, good);
    expect(res.status).toBe(200);
    expect(mocks.importListItems).toHaveBeenCalledWith('u1', { listId: 'l1' }, [{ slug: 'duke', program: 'ANY' }]);
    expect(res.headers.get('cache-control') ?? '').not.toMatch(/public|s-maxage/);
  });

  it('save: strict body (a user, a school id, two targets) is a 400 and never reaches the writer', async () => {
    for (const body of [
      { ...good, userId: 'b' },
      { ...good, items: [{ slug: 'duke', program: 'ANY', schoolId: 's' }] },
      { ...good, target: { listId: 'l1', newList: 'x' } },
      { target: { newList: 'x' }, items: [] },
    ]) {
      expect((await json(save, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(mocks.importListItems).not.toHaveBeenCalled();
  });

  it("save: another member's list is a 404; the caps are 409 with their codes", async () => {
    mocks.importListItems.mockResolvedValueOnce(null);
    expect((await json(save, good)).status).toBe(404);
    mocks.importListItems.mockResolvedValueOnce('cap');
    const cap = await json(save, good);
    expect(cap.status).toBe(409);
    expect(await cap.json()).toMatchObject({ code: 'MEDSCHOOLS_ITEM_CAP', max: 200 });
    mocks.importListItems.mockResolvedValueOnce('list-cap');
    const listCap = await json(save, good);
    expect(listCap.status).toBe(409);
    expect(await listCap.json()).toMatchObject({ code: 'MEDSCHOOLS_LIST_CAP', max: 20 });
  });
});

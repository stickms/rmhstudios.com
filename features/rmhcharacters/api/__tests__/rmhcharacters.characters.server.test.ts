/**
 * Character sheets are user data stored under a client-chosen id, so these hold the
 * ownership boundary: a save never overwrites another account's row, a delete never
 * touches one, the list returns only the caller's, and what is stored is the
 * normalised sheet, not the raw body.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } } }));

const db = {
  findUnique: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
};
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    rmhCharacter: {
      findUnique: (...a: unknown[]) => db.findUnique(...a),
      findMany: (...a: unknown[]) => db.findMany(...a),
      count: (...a: unknown[]) => db.count(...a),
      create: (...a: unknown[]) => db.create(...a),
      update: (...a: unknown[]) => db.update(...a),
      deleteMany: (...a: unknown[]) => db.deleteMany(...a),
    },
  },
}));

import { route as listRoute } from '../rmhcharacters.characters.server';
import { route as oneRoute } from '../rmhcharacters.characters.$id.server';
import { newDnd5e } from '../../engine/factory';

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
const handler = (r: unknown, m: string) => (r as { handlers: Record<string, Handler> }).handlers[m]!;

let ip = 0;
function req(method: string, body?: unknown) {
  return new Request('https://rmhstudios.com/api/rmhcharacters/characters/x', {
    method,
    headers: {
      cookie: 'better-auth.session_token=x',
      'content-type': 'application/json',
      'cf-connecting-ip': `10.9.0.${ip++ % 250}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const sheet = (over: Record<string, unknown> = {}) => ({ ...newDnd5e(), name: 'Ilsa', ...over });

beforeEach(() => {
  for (const f of Object.values(db)) f.mockReset();
  getSession.mockResolvedValue({ user: { id: 'me' } });
  db.count.mockResolvedValue(0);
  db.create.mockResolvedValue({ updatedAt: new Date(1_800_000_000_000) });
  db.update.mockResolvedValue({ updatedAt: new Date(1_800_000_000_000) });
  db.deleteMany.mockResolvedValue({ count: 1 });
});

describe('PUT /api/rmhcharacters/characters/$id', () => {
  it('creates a new character on the caller’s account, stored normalised', async () => {
    db.findUnique.mockResolvedValue(null);
    const res = await handler(
      oneRoute,
      'PUT',
    )({
      request: req('PUT', { character: sheet({ evil: '<script>', portrait: 'javascript:alert(1)' }) }),
      params: { id: 'c-1' },
    });
    expect(res.status).toBe(200);
    const arg = db.create.mock.calls[0]![0] as {
      data: { id: string; userId: string; system: string; data: Record<string, unknown> };
    };
    expect(arg.data.id).toBe('c-1');
    expect(arg.data.userId).toBe('me');
    expect(arg.data.system).toBe('dnd5e');
    expect(arg.data.data).not.toHaveProperty('evil');
    expect(arg.data.data).not.toHaveProperty('portrait');
    expect(arg.data.data.id).toBe('c-1');
  });

  it('refuses an id that belongs to another account and writes nothing', async () => {
    db.findUnique.mockResolvedValue({ userId: 'someone-else' });
    const res = await handler(
      oneRoute,
      'PUT',
    )({ request: req('PUT', { character: sheet() }), params: { id: 'theirs' } });
    expect(res.status).toBe(409);
    expect(db.create).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('updates the caller’s own row', async () => {
    db.findUnique.mockResolvedValue({ userId: 'me' });
    const res = await handler(
      oneRoute,
      'PUT',
    )({ request: req('PUT', { character: sheet({ name: 'Renamed' }) }), params: { id: 'mine' } });
    expect(res.status).toBe(200);
    expect((db.update.mock.calls[0]![0] as { data: { name: string } }).data.name).toBe('Renamed');
  });

  it('rejects something that is not a character sheet', async () => {
    db.findUnique.mockResolvedValue(null);
    const res = await handler(
      oneRoute,
      'PUT',
    )({ request: req('PUT', { character: { system: 'gurps' } }), params: { id: 'x' } });
    expect(res.status).toBe(400);
    expect(db.create).not.toHaveBeenCalled();
  });

  it('caps how many characters one account can create', async () => {
    db.findUnique.mockResolvedValue(null);
    db.count.mockResolvedValue(200);
    const res = await handler(
      oneRoute,
      'PUT',
    )({ request: req('PUT', { character: sheet() }), params: { id: 'one-too-many' } });
    expect(res.status).toBe(422);
    expect(db.create).not.toHaveBeenCalled();
  });

  it('needs a signed-in account', async () => {
    getSession.mockResolvedValue(null);
    const res = await handler(oneRoute, 'PUT')({ request: req('PUT', { character: sheet() }), params: { id: 'x' } });
    expect(res.status).toBe(401);
    expect(db.findUnique).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/rmhcharacters/characters/$id', () => {
  it('deletes only within the caller’s own rows', async () => {
    const res = await handler(oneRoute, 'DELETE')({ request: req('DELETE'), params: { id: 'anything' } });
    expect(res.status).toBe(200);
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { id: 'anything', userId: 'me' } });
  });
});

describe('GET /api/rmhcharacters/characters', () => {
  it('lists only the caller’s characters, re-normalised', async () => {
    db.findMany.mockResolvedValue([
      { id: 'a', data: sheet({ junk: 1 }), updatedAt: new Date(1_800_000_000_000) },
      { id: 'b', data: { not: 'a sheet' }, updatedAt: new Date() },
    ]);
    const res = await handler(listRoute, 'GET')({ request: req('GET'), params: {} });
    expect(res.status).toBe(200);
    expect((db.findMany.mock.calls[0]![0] as { where: unknown }).where).toEqual({ userId: 'me' });
    const body = (await res.json()) as { characters: { id: string; updatedAt: number }[] };
    expect(body.characters.map((c) => c.id)).toEqual(['a']);
    expect(body.characters[0]).not.toHaveProperty('junk');
    expect(body.characters[0]!.updatedAt).toBe(1_800_000_000_000);
  });
});

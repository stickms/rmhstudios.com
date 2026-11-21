import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cloud Studio projects: ownership, the 25-project cap under the member's lock, revision-checked saves, the 1 MB
 * ceiling and the structural check. The handlers are driven for real (session mocked) over an in-memory fake of the
 * `studio_project` table, so a status code asserted here is the one the wrapper sends.
 */

interface Row {
  id: string;
  userId: string;
  name: string;
  data: unknown;
  sizeBytes: number;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

const db = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  events: [] as string[],
  calls: [] as { method: string; args: Record<string, unknown> }[],
  /** Set to make the next existence check miss, as if the row appeared a moment later. */
  hideFromFindUnique: false,
  session: { user: { id: 'u1', name: 'Ada', isAdmin: false } } as {
    user: { id: string; name: string; isAdmin: boolean };
  },
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => db.session } },
}));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: vi.fn(async (_tx: unknown, key: string) => {
    db.events.push(`lock:${key}`);
  }),
}));
vi.mock('@/lib/prisma.server', () => {
  const rows = db.rows as unknown as Map<string, Row>;
  const pick = (row: Row, select?: Record<string, boolean>) => {
    if (!select) return { ...row };
    return Object.fromEntries(
      Object.entries(select)
        .filter(([, on]) => on)
        .map(([k]) => [k, row[k as keyof Row]]),
    );
  };
  const studioProject = {
    findMany: async (args: { where: { userId: string }; select?: Record<string, boolean> }) => {
      db.calls.push({ method: 'findMany', args });
      return [...rows.values()]
        .filter((r) => r.userId === args.where.userId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map((r) => pick(r, args.select));
    },
    findFirst: async (args: { where: { id: string; userId: string }; select?: Record<string, boolean> }) => {
      const r = rows.get(args.where.id);
      return r && r.userId === args.where.userId ? pick(r, args.select) : null;
    },
    findUnique: async (args: { where: { id: string }; select?: Record<string, boolean> }) => {
      if (db.hideFromFindUnique) return null;
      const r = rows.get(args.where.id);
      return r ? pick(r, args.select) : null;
    },
    count: async (args: { where: { userId: string } }) => {
      db.events.push('count');
      return [...rows.values()].filter((r) => r.userId === args.where.userId).length;
    },
    create: async (args: {
      data: Omit<Row, 'revision' | 'createdAt' | 'updatedAt'>;
      select?: Record<string, boolean>;
    }) => {
      db.events.push('create');
      if (rows.has(args.data.id)) throw Object.assign(new Error('unique'), { code: 'P2002' });
      const now = new Date();
      const row: Row = { ...args.data, revision: 1, createdAt: now, updatedAt: now };
      rows.set(row.id, row);
      return pick(row, args.select);
    },
    updateMany: async (args: {
      where: { id: string; userId: string; revision: number };
      data: { name: string; data: unknown; sizeBytes: number; revision: { increment: number } };
    }) => {
      db.calls.push({ method: 'updateMany', args });
      const r = rows.get(args.where.id);
      if (!r || r.userId !== args.where.userId || r.revision !== args.where.revision) return { count: 0 };
      r.name = args.data.name;
      r.data = args.data.data;
      r.sizeBytes = args.data.sizeBytes;
      r.revision += args.data.revision.increment;
      r.updatedAt = new Date();
      return { count: 1 };
    },
    deleteMany: async (args: { where: { id: string; userId: string } }) => {
      const r = rows.get(args.where.id);
      if (!r || r.userId !== args.where.userId) return { count: 0 };
      rows.delete(args.where.id);
      return { count: 1 };
    },
  };
  const prisma = {
    studioProject,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  return { prisma };
});

import type { ApiRoute } from '@/lib/api/route.server';
import { route as listRoute } from '@/lib/studio/api/studio.projects.server';
import { route as itemRoute } from '@/lib/studio/api/studio.projects.$id.server';
import { exportStudioProjects, saveCloudProject } from '@/lib/studio/cloud-projects.server';
import { MAX_CLOUD_PROJECTS, MAX_REQUEST_BYTES } from '@/lib/studio/project-schema';
import type { StudioProjectData } from '@/lib/studio/projects.contract';

function project(id: string, over: Partial<StudioProjectData> = {}): StudioProjectData {
  return {
    id,
    name: 'Demo',
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [],
    clips: {},
    patterns: [],
    masterVolume: 1,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

/** A valid project whose JSON is over 1 MB: one MIDI clip with 20 000 notes. */
function hugeProject(id: string): StudioProjectData {
  const notes = Array.from({ length: 20_000 }, (_, i) => ({
    id: `note-${i}`,
    pitch: 60,
    startBeat: i,
    durationBeats: 1,
    velocity: 100,
  }));
  return project(id, {
    tracks: [
      {
        id: 't1',
        name: 'Keys',
        type: 'midi',
        color: '#fff',
        volume: 1,
        pan: 0,
        muted: false,
        soloed: false,
        armed: false,
        clipIds: ['c1'],
        pluginChain: [],
        sends: [],
        height: 80,
      },
    ],
    clips: {
      c1: {
        id: 'c1',
        trackId: 't1',
        type: 'midi',
        name: 'Notes',
        startBeat: 0,
        durationBeats: 4,
        color: '#fff',
        notes,
      },
    },
  });
}

let ip = 0;
function call(
  route: ApiRoute,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  opts: { params?: Record<string, string>; body?: unknown; raw?: string } = {},
) {
  const handler = route.handlers[method]!;
  ip += 1;
  const request = new Request('https://rmhstudios.com/api/studio/projects', {
    method,
    headers: {
      'content-type': 'application/json',
      cookie: 'better-auth.session_token=abc',
      'cf-connecting-ip': `10.1.${Math.floor(ip / 250)}.${ip % 250}`,
    },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: opts.raw ?? JSON.stringify(opts.body) }),
  });
  return handler({ request, params: opts.params ?? {} });
}

function seed(id: string, userId: string, revision = 1) {
  const now = new Date(2026, 10, 25);
  db.rows.set(id, {
    id,
    userId,
    name: `P-${id}`,
    data: project(id),
    sizeBytes: 100,
    revision,
    createdAt: now,
    updatedAt: now,
  });
}

beforeEach(() => {
  db.rows.clear();
  db.events.length = 0;
  db.calls.length = 0;
  db.hideFromFindUnique = false;
  db.session = { user: { id: 'u1', name: 'Ada', isAdmin: false } };
});

describe('listing', () => {
  it('never selects the project JSON and returns only the caller’s own rows', async () => {
    seed('mine', 'u1');
    seed('theirs', 'u2');
    const res = await call(listRoute, 'GET');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { projects: { id: string }[]; limit: number };
    expect(body.projects.map((p) => p.id)).toEqual(['mine']);
    expect(body.limit).toBe(MAX_CLOUD_PROJECTS);
    const select = db.calls.find((c) => c.method === 'findMany')!.args.select as Record<string, boolean>;
    expect(select).toBeDefined();
    expect(Object.keys(select)).not.toContain('data');
    expect(Object.keys(select)).toContain('sizeBytes');
    expect(JSON.stringify(body)).not.toContain('"data"');
  });
});

describe('create and the 25-project cap', () => {
  it('takes the member’s lock before it counts and inserts', async () => {
    const res = await call(listRoute, 'POST', { body: { id: 'p1', name: 'First', data: project('p1') } });
    expect(res.status).toBe(200);
    expect(db.events).toEqual(['lock:studio-projects:u1', 'count', 'create']);
    expect(db.rows.get('p1')!.userId).toBe('u1');
  });

  it('refuses the 26th project and leaves the table alone', async () => {
    for (let i = 0; i < MAX_CLOUD_PROJECTS; i++) seed(`p${i}`, 'u1');
    seed('other-1', 'u2'); // another member's rows do not count against this member
    const res = await call(listRoute, 'POST', {
      body: { id: 'p-extra', name: 'One too many', data: project('p-extra') },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'limit' });
    expect(db.rows.has('p-extra')).toBe(false);
    expect(db.events).toEqual(['lock:studio-projects:u1', 'count']);
  });

  it('allows the 25th project', async () => {
    for (let i = 0; i < MAX_CLOUD_PROJECTS - 1; i++) seed(`p${i}`, 'u1');
    const res = await call(listRoute, 'POST', { body: { id: 'p-last', name: 'Last', data: project('p-last') } });
    expect(res.status).toBe(200);
  });

  it('reports a project the member already has as "exists" with its revision', async () => {
    seed('p1', 'u1', 4);
    const res = await call(listRoute, 'POST', { body: { id: 'p1', name: 'Again', data: project('p1') } });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'exists', revision: 4 });
  });

  it('turns a primary-key race into id-taken', async () => {
    // Another member's row appears between the existence check and the insert.
    seed('raced', 'u2');
    db.hideFromFindUnique = true;
    const out = await saveCloudProject('u1', { id: 'raced', name: 'Mine', data: project('raced') });
    expect(out).toEqual({ ok: false, reason: 'id-taken' });
    expect(db.rows.get('raced')!.userId).toBe('u2');
  });
});

describe('another member’s id', () => {
  it('is a 409 on create and the row is untouched', async () => {
    seed('shared-id', 'u2', 3);
    const before = JSON.stringify(db.rows.get('shared-id'));
    const res = await call(listRoute, 'POST', {
      body: { id: 'shared-id', name: 'Mine now', data: project('shared-id') },
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe('id-taken');
    expect(body).not.toHaveProperty('revision');
    expect(JSON.stringify(db.rows.get('shared-id'))).toBe(before);
  });

  it('is a 409 on save, whatever revision is named, and the row is untouched', async () => {
    seed('shared-id', 'u2', 3);
    const before = JSON.stringify(db.rows.get('shared-id'));
    const res = await call(itemRoute, 'PUT', {
      params: { id: 'shared-id' },
      body: { name: 'Mine now', data: project('shared-id'), baseRevision: 3 },
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe('id-taken');
    expect(body).not.toHaveProperty('revision');
    expect(JSON.stringify(db.rows.get('shared-id'))).toBe(before);
  });

  it('cannot be read or deleted', async () => {
    seed('theirs', 'u2');
    expect((await call(itemRoute, 'GET', { params: { id: 'theirs' } })).status).toBe(404);
    expect((await call(itemRoute, 'DELETE', { params: { id: 'theirs' } })).status).toBe(404);
    expect(db.rows.has('theirs')).toBe(true);
  });
});

describe('revision-checked saves', () => {
  it('increments the revision, and a stale base is a 409 carrying the current revision', async () => {
    seed('p1', 'u1', 1);
    const ok = await call(itemRoute, 'PUT', {
      params: { id: 'p1' },
      body: { name: 'Renamed', data: project('p1'), baseRevision: 1 },
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { project: { revision: number } }).project.revision).toBe(2);
    expect(db.rows.get('p1')!.name).toBe('Renamed');

    const stale = await call(itemRoute, 'PUT', {
      params: { id: 'p1' },
      body: { name: 'Second tab', data: project('p1'), baseRevision: 1 },
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      code: 'stale',
      revision: 2,
      error: 'This project changed on another device',
    });
    expect(db.rows.get('p1')!.name).toBe('Renamed');
  });

  it('is one conditional update scoped to id, owner and revision', async () => {
    seed('p1', 'u1', 5);
    await call(itemRoute, 'PUT', {
      params: { id: 'p1' },
      body: { name: 'N', data: project('p1'), baseRevision: 5 },
    });
    const update = db.calls.find((c) => c.method === 'updateMany')!;
    expect(update.args.where).toEqual({ id: 'p1', userId: 'u1', revision: 5 });
    expect(update.args.data).toMatchObject({ revision: { increment: 1 } });
  });

  it('is a 404 when the project does not exist', async () => {
    const res = await call(itemRoute, 'PUT', {
      params: { id: 'gone' },
      body: { name: 'N', data: project('gone'), baseRevision: 1 },
    });
    expect(res.status).toBe(404);
  });

  it('refuses a body whose project id is not the one in the path', async () => {
    seed('p1', 'u1');
    const res = await call(itemRoute, 'PUT', {
      params: { id: 'p1' },
      body: { name: 'N', data: project('other'), baseRevision: 1 },
    });
    expect(res.status).toBe(400);
  });
});

describe('size and shape', () => {
  it('refuses a request body over the ceiling with a 413 before parsing it', async () => {
    const raw = JSON.stringify({
      id: 'p1',
      name: 'Big',
      data: project('p1'),
      pad: 'x'.repeat(MAX_REQUEST_BYTES),
    });
    const res = await call(listRoute, 'POST', { raw });
    expect(res.status).toBe(413);
    expect(db.rows.size).toBe(0);
  });

  it('refuses project JSON over 1 MB with a 413 and stores nothing', async () => {
    const data = hugeProject('p1');
    expect(Buffer.byteLength(JSON.stringify(data), 'utf8')).toBeGreaterThan(1_048_576);
    expect(await saveCloudProject('u1', { id: 'p1', name: 'Big', data })).toEqual({
      ok: false,
      reason: 'too-large',
    });
    expect(db.rows.size).toBe(0);
    const res = await call(listRoute, 'POST', { raw: JSON.stringify({ id: 'p1', name: 'Big', data }) });
    expect(res.status).toBe(413);
    expect(db.rows.size).toBe(0);
  });

  it('refuses a malformed project with a 400 and stores nothing', async () => {
    const bad: unknown[] = [
      { ...project('p1'), bpm: 99_999 },
      { ...project('p1'), tracks: 'nope' },
      { ...project('p1'), timeSignature: [4] },
      { ...project('p1'), clips: { c1: { id: 'c1', type: 'midi', notes: [{ pitch: 500 }] } } },
      { ...project('p1'), masterVolume: -5 },
      'not an object',
    ];
    for (const data of bad) {
      const res = await call(listRoute, 'POST', { raw: JSON.stringify({ id: 'p1', name: 'Bad', data }) });
      expect(res.status).toBe(400);
    }
    expect((await call(listRoute, 'POST', { body: { id: 'p1', name: '', data: project('p1') } })).status).toBe(400);
    expect(
      (await call(listRoute, 'POST', { body: { id: 'p1', name: 'x'.repeat(81), data: project('p1') } })).status,
    ).toBe(400);
    expect(
      (await call(listRoute, 'POST', { body: { id: 'p1', name: 'Ok', data: project('different') } })).status,
    ).toBe(400);
    expect(db.rows.size).toBe(0);
  });
});

describe('delete and export', () => {
  it('deletes the caller’s project', async () => {
    seed('p1', 'u1');
    const res = await call(itemRoute, 'DELETE', { params: { id: 'p1' } });
    expect(res.status).toBe(200);
    expect(db.rows.has('p1')).toBe(false);
  });

  it('exports names, sizes and the JSON of the member’s projects only', async () => {
    seed('mine', 'u1');
    seed('theirs', 'u2');
    const out = await exportStudioProjects('u1');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'mine', name: 'P-mine', sizeBytes: 100, revision: 1 });
    expect(out[0]!.data).toMatchObject({ id: 'mine' });
  });
});

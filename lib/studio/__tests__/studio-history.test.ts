import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Earlier versions of a cloud Studio project: capture inside the save, the 10-minute window, the restore, the
 * 20-version and 20 MB trims, ownership, stale restore and project deletion. The functions and handlers run for real
 * over an in-memory fake of the `studio_project` and `studio_project_revision` tables (no database).
 */

interface ProjectRow {
  id: string;
  userId: string;
  name: string;
  data: unknown;
  sizeBytes: number;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}
interface VersionRow {
  id: string;
  projectId: string;
  userId: string;
  revision: number;
  name: string;
  data: unknown;
  sizeBytes: number;
  trackCount: number;
  savedAt: Date;
}

const db = vi.hoisted(() => ({
  projects: new Map<string, Record<string, unknown>>(),
  versions: [] as Record<string, unknown>[],
  events: [] as string[],
  seq: 0,
  session: { user: { id: 'u1', name: 'Ada', isAdmin: false } },
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: async () => db.session } } }));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: vi.fn(async (_tx: unknown, key: string) => {
    db.events.push(`lock:${key}`);
  }),
}));
vi.mock('@/lib/prisma.server', () => {
  const projects = db.projects as unknown as Map<string, ProjectRow>;
  const versions = () => db.versions as unknown as VersionRow[];
  const pick = (row: object, select?: Record<string, boolean>) => {
    if (!select) return { ...row };
    return Object.fromEntries(
      Object.entries(select)
        .filter(([, on]) => on)
        .map(([k]) => [k, (row as Record<string, unknown>)[k]]),
    );
  };
  const matches = (row: VersionRow, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'in' in v)
        return (v as { in: string[] }).in.includes(row[k as keyof VersionRow] as string);
      return row[k as keyof VersionRow] === v;
    });
  const order = (rows: VersionRow[], orderBy: unknown) => {
    const specs = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Record<string, 'asc' | 'desc'>[];
    return [...rows].sort((a, b) => {
      for (const spec of specs) {
        const [[key, dir]] = Object.entries(spec) as [[keyof VersionRow, 'asc' | 'desc']];
        const x = a[key] instanceof Date ? (a[key] as Date).getTime() : (a[key] as number | string);
        const y = b[key] instanceof Date ? (b[key] as Date).getTime() : (b[key] as number | string);
        if (x === y) continue;
        return (x < y ? -1 : 1) * (dir === 'asc' ? 1 : -1);
      }
      return 0;
    });
  };
  const studioProject = {
    findFirst: async (args: { where: { id: string; userId: string }; select?: Record<string, boolean> }) => {
      const r = projects.get(args.where.id);
      return r && r.userId === args.where.userId ? pick(r, args.select) : null;
    },
    findUnique: async (args: { where: { id: string }; select?: Record<string, boolean> }) => {
      const r = projects.get(args.where.id);
      return r ? pick(r, args.select) : null;
    },
    count: async (args: { where: { userId: string } }) =>
      [...projects.values()].filter((r) => r.userId === args.where.userId).length,
    create: async (args: {
      data: Omit<ProjectRow, 'revision' | 'createdAt' | 'updatedAt'>;
      select?: Record<string, boolean>;
    }) => {
      const now = new Date();
      const row: ProjectRow = { ...args.data, revision: 1, createdAt: now, updatedAt: now };
      projects.set(row.id, row);
      return pick(row, args.select);
    },
    updateMany: async (args: {
      where: { id: string; userId: string; revision: number };
      data: { name: string; data: unknown; sizeBytes: number; revision: { increment: number } };
    }) => {
      const r = projects.get(args.where.id);
      if (!r || r.userId !== args.where.userId || r.revision !== args.where.revision) return { count: 0 };
      r.name = args.data.name;
      r.data = args.data.data;
      r.sizeBytes = args.data.sizeBytes;
      r.revision += args.data.revision.increment;
      r.updatedAt = new Date();
      return { count: 1 };
    },
    deleteMany: async (args: { where: { id: string; userId: string } }) => {
      db.events.push('delete-project');
      const r = projects.get(args.where.id);
      if (!r || r.userId !== args.where.userId) return { count: 0 };
      projects.delete(args.where.id);
      return { count: 1 };
    },
  };
  const studioProjectRevision = {
    findFirst: async (args: {
      where: Record<string, unknown>;
      orderBy?: unknown;
      select?: Record<string, boolean>;
    }) => {
      const rows = order(
        versions().filter((v) => matches(v, args.where)),
        args.orderBy ?? { revision: 'desc' },
      );
      return rows[0] ? pick(rows[0], args.select) : null;
    },
    findMany: async (args: { where: Record<string, unknown>; orderBy?: unknown; select?: Record<string, boolean> }) =>
      order(
        versions().filter((v) => matches(v, args.where)),
        args.orderBy ?? { revision: 'desc' },
      ).map((v) => pick(v, args.select)),
    create: async (args: { data: Omit<VersionRow, 'id'> }) => {
      if (versions().some((v) => v.projectId === args.data.projectId && v.revision === args.data.revision)) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      db.seq += 1;
      const row = { id: `v${db.seq}`, ...args.data };
      db.versions.push(row);
      return row;
    },
    deleteMany: async (args: { where: Record<string, unknown> }) => {
      const gone = versions().filter((v) => matches(v, args.where));
      db.versions = db.versions.filter((v) => !gone.includes(v as unknown as VersionRow));
      return { count: gone.length };
    },
  };
  const prisma = {
    studioProject,
    studioProjectRevision,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  return { prisma };
});

import type { ApiRoute } from '@/lib/api/route.server';
import { route as listRoute } from '@/lib/studio/api/studio.projects.$id.versions.server';
import { route as oneRoute } from '@/lib/studio/api/studio.projects.$id.versions.$versionId.server';
import { route as restoreRoute } from '@/lib/studio/api/studio.projects.$id.versions.$versionId.restore.server';
import { deleteCloudProject, restoreVersion, saveCloudProject } from '@/lib/studio/cloud-projects.server';
import { getVersion, listVersions, studioHistoryErasureOps } from '@/lib/studio/project-history.server';
import { MAX_VERSIONS_PER_PROJECT, MAX_VERSION_BYTES_PER_MEMBER } from '@/lib/studio/project-history';
import type { StudioProjectData } from '@/lib/studio/projects.contract';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 25, 12, 0, 0);
const at = (minutes: number) => vi.setSystemTime(T0 + minutes * MIN);

function project(id: string, tracks = 1): StudioProjectData {
  return {
    id,
    name: 'Demo',
    bpm: 120,
    timeSignature: [4, 4],
    tracks: Array.from({ length: tracks }, (_, i) => ({
      id: `t${i}`,
      name: `T${i}`,
      type: 'midi' as const,
      color: '#fff',
      volume: 1,
      pan: 0,
      muted: false,
      soloed: false,
      armed: false,
      clipIds: [],
      pluginChain: [],
      sends: [],
      height: 80,
    })),
    clips: {},
    patterns: [],
    masterVolume: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

/** Create the project at minute 0, then save `tracks` counts at the given minutes, each from the latest revision. */
async function create(id = 'p1', userId = 'u1') {
  const res = await saveCloudProject(userId, { id, name: 'Demo', data: project(id, 1) });
  expect(res.ok).toBe(true);
}
async function saveAt(minute: number, tracks: number, id = 'p1', userId = 'u1') {
  at(minute);
  const current = db.projects.get(id) as unknown as ProjectRow;
  const res = await saveCloudProject(userId, {
    id,
    name: 'Demo',
    data: project(id, tracks),
    baseRevision: current.revision,
  });
  expect(res.ok).toBe(true);
}
const versionsOf = (id = 'p1') => (db.versions as unknown as VersionRow[]).filter((v) => v.projectId === id);

let ip = 0;
function call(route: ApiRoute, method: 'GET' | 'POST', params: Record<string, string>, body?: unknown) {
  ip += 1;
  const request = new Request('https://rmhstudios.com/api/studio/projects', {
    method,
    headers: {
      'content-type': 'application/json',
      cookie: 'better-auth.session_token=abc',
      'cf-connecting-ip': `10.9.${Math.floor(ip / 250)}.${ip % 250}`,
    },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
  return route.handlers[method]!({ request, params });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(0);
  db.projects.clear();
  db.versions = [];
  db.events = [];
  db.seq = 0;
  db.session = { user: { id: 'u1', name: 'Ada', isAdmin: false } };
});
afterEach(() => vi.useRealTimers());

describe('studio history: capture on save', () => {
  it('creating a project keeps nothing; the first replacing save keeps the version it replaces', async () => {
    await create();
    expect(versionsOf()).toHaveLength(0);
    await saveAt(15, 2);
    const kept = versionsOf();
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ revision: 1, userId: 'u1', trackCount: 1 });
    expect((await listVersions('u1', 'p1'))![0]!.trackCount).toBe(1);
  });

  it('takes the member lock before the save and the capture', async () => {
    await create();
    db.events = [];
    await saveAt(15, 2);
    expect(db.events[0]).toBe('lock:studio-projects:u1');
  });

  it('two saves within ten minutes keep one version', async () => {
    await create();
    await saveAt(2, 2);
    await saveAt(5, 3);
    expect(versionsOf()).toHaveLength(1);
    expect(versionsOf()[0]).toMatchObject({ revision: 1 });
  });

  it('autosaving every minute for an hour keeps about six versions, not sixty', async () => {
    await create();
    for (let m = 1; m <= 60; m++) await saveAt(m, 1 + (m % 5));
    const n = versionsOf().length;
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(7);
  });

  it('a stale save keeps nothing', async () => {
    await create();
    at(30);
    const res = await saveCloudProject('u1', { id: 'p1', name: 'Demo', data: project('p1', 2), baseRevision: 9 });
    expect(res).toMatchObject({ ok: false, reason: 'stale', revision: 1 });
    expect(versionsOf()).toHaveLength(0);
  });
});

describe('studio history: restore', () => {
  it('waives the window, writes a new revision and keeps the replaced state', async () => {
    await create();
    await saveAt(15, 2); // keeps rev 1 (1 track)
    await saveAt(17, 3); // within window: rev 2 not kept
    const first = versionsOf()[0]!;
    at(18);
    const res = await restoreVersion('u1', 'p1', first.id, 3);
    expect(res).toMatchObject({ ok: true });
    const row = db.projects.get('p1') as unknown as ProjectRow;
    expect(row.revision).toBe(4);
    expect((row.data as StudioProjectData).tracks).toHaveLength(1);
    // The 3-track state, saved a minute earlier, is kept despite the window, so the restore can be undone.
    expect(versionsOf().map((v) => [v.revision, v.trackCount])).toEqual(expect.arrayContaining([[3, 3]]));
  });

  it('a stale restore is refused with the current revision and changes nothing', async () => {
    await create();
    await saveAt(15, 2);
    const first = versionsOf()[0]!;
    const before = versionsOf().length;
    const res = await restoreVersion('u1', 'p1', first.id, 1);
    expect(res).toEqual({ ok: false, reason: 'stale', revision: 2 });
    expect(versionsOf()).toHaveLength(before);
    expect((db.projects.get('p1') as unknown as ProjectRow).revision).toBe(2);
  });

  it('the restore endpoint answers 409 with the current revision when stale', async () => {
    await create();
    await saveAt(15, 2);
    const first = versionsOf()[0]!;
    const res = await call(restoreRoute, 'POST', { id: 'p1', versionId: first.id }, { baseRevision: 1 });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'stale', revision: 2 });
  });

  it('the restore endpoint restores and returns the new summary', async () => {
    await create();
    await saveAt(15, 2);
    const first = versionsOf()[0]!;
    const res = await call(restoreRoute, 'POST', { id: 'p1', versionId: first.id }, { baseRevision: 2 });
    expect(res.status).toBe(200);
    expect((await res.json()).project).toMatchObject({ id: 'p1', revision: 3 });
  });
});

describe('studio history: trimming', () => {
  it('the 21st version removes the oldest', async () => {
    await create();
    for (let i = 1; i <= MAX_VERSIONS_PER_PROJECT + 1; i++) await saveAt(i * 15, 1 + (i % 3));
    const revisions = versionsOf()
      .map((v) => v.revision)
      .sort((a, b) => a - b);
    expect(revisions).toHaveLength(MAX_VERSIONS_PER_PROJECT);
    expect(revisions[0]).toBe(2); // revision 1 was the oldest and is gone
  });

  it('a restore never trims the version it restores, even when it is the oldest of 20', async () => {
    await create();
    for (let i = 1; i <= MAX_VERSIONS_PER_PROJECT; i++) await saveAt(i * 15, 1 + (i % 3));
    const oldest = versionsOf().find((v) => v.revision === 1)!;
    expect(versionsOf()).toHaveLength(MAX_VERSIONS_PER_PROJECT);
    at(500);
    const rev = (db.projects.get('p1') as unknown as ProjectRow).revision;
    expect(await restoreVersion('u1', 'p1', oldest.id, rev)).toMatchObject({ ok: true });
    const ids = versionsOf().map((v) => v.id);
    expect(ids).toContain(oldest.id);
    expect(ids).toContain(`v${db.seq}`); // the state the restore replaced
    expect(versionsOf()).toHaveLength(MAX_VERSIONS_PER_PROJECT);
  });

  it('the 20 MB cap trims oldest first across projects', async () => {
    const big = Math.floor(MAX_VERSION_BYTES_PER_MEMBER / 2) + 1000;
    const seedVersion = (id: string, projectId: string, minutes: number, sizeBytes: number) => {
      db.versions.push({
        id,
        projectId,
        userId: 'u1',
        revision: Number(id.length) + 50,
        name: 'x',
        data: {},
        sizeBytes,
        trackCount: 0,
        savedAt: new Date(T0 - minutes * MIN),
      });
    };
    await create('pa');
    await create('pb');
    seedVersion('old-a', 'pa', 300, big);
    seedVersion('mid-b', 'pb', 200, big);
    // A third save (project pa, window open) pushes the member over 20 MB: the oldest, in the other project, goes.
    seedVersion('keep-b2', 'pb', 100, 10);
    await saveAt(30, 2, 'pa');
    const ids = (db.versions as unknown as VersionRow[]).map((v) => v.id);
    expect(ids).not.toContain('old-a');
    expect(ids).toContain('mid-b');
    expect(ids).toContain('keep-b2');
    const total = (db.versions as unknown as VersionRow[]).reduce((s, v) => s + v.sizeBytes, 0);
    expect(total).toBeLessThanOrEqual(MAX_VERSION_BYTES_PER_MEMBER);
  });
});

describe('studio history: ownership and deletion', () => {
  it('another member’s project or version is a 404 on every endpoint', async () => {
    await create('p1', 'u2');
    await saveAt(15, 2, 'p1', 'u2');
    const version = versionsOf()[0]!;
    expect((await call(listRoute, 'GET', { id: 'p1' })).status).toBe(404);
    expect((await call(oneRoute, 'GET', { id: 'p1', versionId: version.id })).status).toBe(404);
    expect((await call(restoreRoute, 'POST', { id: 'p1', versionId: version.id }, { baseRevision: 2 })).status).toBe(
      404,
    );
    expect(await getVersion('u1', 'p1', version.id)).toBeNull();
    expect(await listVersions('u1', 'p1')).toBeNull();
    expect((db.projects.get('p1') as unknown as ProjectRow).revision).toBe(2);
  });

  it('the list endpoint returns metadata without data, newest first', async () => {
    await create();
    await saveAt(15, 2);
    await saveAt(40, 3);
    const res = await call(listRoute, 'GET', { id: 'p1' });
    expect(res.status).toBe(200);
    const { versions } = await res.json();
    expect(versions.map((v: { revision: number }) => v.revision)).toEqual([2, 1]);
    expect(versions[0]).not.toHaveProperty('data');
    expect(versions[0]).toHaveProperty('trackCount');
  });

  it('the single-version endpoint returns the data for the owner', async () => {
    await create();
    await saveAt(15, 2);
    const version = versionsOf()[0]!;
    const res = await call(oneRoute, 'GET', { id: 'p1', versionId: version.id });
    expect(res.status).toBe(200);
    expect((await res.json()).version.data.tracks).toHaveLength(1);
  });

  it('deleting a project deletes its versions', async () => {
    await create();
    await saveAt(15, 2);
    await create('p2');
    await saveAt(16, 2, 'p2');
    expect(versionsOf('p1')).toHaveLength(1);
    expect(await deleteCloudProject('u1', 'p1')).toBe(true);
    expect(versionsOf('p1')).toHaveLength(0);
    expect(versionsOf('p2')).toHaveLength(1);
  });

  it('erasure ops are one deleteMany scoped to the member', () => {
    expect(studioHistoryErasureOps('u1')).toHaveLength(1);
  });
});

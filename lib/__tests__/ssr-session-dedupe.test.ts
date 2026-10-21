/**
 * WS1 (server perf 2026-10-21): the SSR path resolves the session ONCE per
 * request.
 *
 * `getRequestSession()` memoizes on the request object and skips Better Auth
 * for cookie-less requests. That only helps if page loaders use it — a loader
 * that calls `auth.api.getSession` directly re-runs the session + user lookups
 * and the tier resolution, and does it for anonymous visitors too. This file
 * pins both halves: the helper's behaviour, and that the `_site` loaders go
 * through it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, getRequest } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getRequest: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@tanstack/react-start/server', () => ({ getRequest }));

import { getRequestSession } from '@/lib/auth-session.server';

const req = (cookie?: string) => ({
  headers: new Headers(cookie ? { cookie } : {}),
});

describe('getRequestSession', () => {
  beforeEach(() => {
    getSession.mockReset();
    getRequest.mockReset();
    getSession.mockResolvedValue({ user: { id: 'u1' } });
  });

  it('resolves Better Auth once for several callers in one request', async () => {
    const r = req('better-auth.session_token=abc');
    getRequest.mockReturnValue(r);
    const [a, b, c] = await Promise.all([
      getRequestSession(),
      getRequestSession(),
      getRequestSession(),
    ]);
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('does not share a session between two requests', async () => {
    getRequest.mockReturnValueOnce(req('better-auth.session_token=a'));
    getSession.mockResolvedValueOnce({ user: { id: 'a' } });
    getRequest.mockReturnValueOnce(req('better-auth.session_token=b'));
    getSession.mockResolvedValueOnce({ user: { id: 'b' } });
    const first = await getRequestSession();
    const second = await getRequestSession();
    expect(first?.user.id).toBe('a');
    expect(second?.user.id).toBe('b');
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('skips Better Auth entirely when there is no session cookie', async () => {
    getRequest.mockReturnValue(req('rmh-lang=en'));
    expect(await getRequestSession()).toBeNull();
    getRequest.mockReturnValue(req());
    expect(await getRequestSession()).toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('turns a Better Auth failure into a signed-out answer', async () => {
    getRequest.mockReturnValue(req('better-auth.session_token=abc'));
    getSession.mockRejectedValue(new Error('db down'));
    expect(await getRequestSession()).toBeNull();
  });
});

describe('_site loaders resolve the session through getRequestSession', () => {
  const root = path.resolve(__dirname, '../../app/routes/_site');

  // The RMHLadder app pages predate the helper and treat a lookup FAILURE as an
  // error (no `.catch`), which the helper would turn into a redirect to /login.
  // They are signed-in-only and low traffic; migrating them is a behaviour
  // decision, not a mechanical swap. Entries come out of this list, never in.
  const ALLOWLIST = new Set([
    'rmhladder/alerts.tsx',
    'rmhladder/companies.tsx',
    'rmhladder/health.tsx',
    'rmhladder/index.tsx',
    'rmhladder/jobs.tsx',
    'rmhladder/jobs/$jobId.tsx',
    'rmhladder/pipeline.tsx',
    'rmhladder/resume.tsx',
    'rmhladder/review.tsx',
    'rmhladder/settings.tsx',
  ]);

  function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
  }

  it('no other route file calls auth.api.getSession directly', () => {
    const offenders = walk(root)
      .map((f) => path.relative(root, f).split(path.sep).join('/'))
      .filter((rel) => !ALLOWLIST.has(rel))
      .filter((rel) =>
        /auth\.api\.getSession\(/.test(fs.readFileSync(path.join(root, rel), 'utf8')),
      );
    expect(offenders).toEqual([]);
  });
});

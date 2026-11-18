/**
 * Static documents (lib/static-document.ts): a route that opts in with
 * `staticData: { staticDocument: true }` must reach the browser, on a first
 * load, with no client JavaScript at all — no entry module, no modulepreload —
 * while still carrying its text and the inline pre-paint script that sets the
 * edition. Read off the built server, so it checks what a visitor gets.
 *
 * The routes are found by their flag, so a new opt-in is covered without
 * touching this file; an ordinary page is checked too, so the test cannot pass
 * by matching nothing.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASE_URL } from './lib/client';

const ROUTES = join(import.meta.dirname, '..', '..', 'app', 'routes');

function staticRoutes(dir = ROUTES): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) out.push(...staticRoutes(file));
    else if (/\.tsx$/.test(name)) {
      const src = readFileSync(file, 'utf8');
      if (!/staticDocument:\s*true/.test(src)) continue;
      const path = /createFileRoute\(\s*'([^']+)'/.exec(src)?.[1];
      if (path && !path.includes('$')) out.push(path.replace(/^\/_site/, '') || '/');
    }
  }
  return out.sort();
}

async function html(path: string): Promise<string> {
  const res = await fetch(BASE_URL + path, { redirect: 'manual' });
  expect(res.status, path).toBe(200);
  return res.text();
}

const moduleScripts = (h: string) => h.match(/<script[^>]*type="module"[^>]*>/g) ?? [];
const modulePreloads = (h: string) => h.match(/<link[^>]*rel="modulepreload"[^>]*>/g) ?? [];

describe('static documents', () => {
  const routes = staticRoutes();

  it('finds the opted-in routes', () => {
    expect(routes).toEqual(expect.arrayContaining(['/cookies', '/copyright', '/privacy', '/terms']));
  });

  it.each(routes)('%s ships no client JavaScript, and still its text and pre-paint', async (path) => {
    const h = await html(path);
    expect(moduleScripts(h)).toEqual([]);
    expect(modulePreloads(h)).toEqual([]);
    expect(h).toContain('id="rmh-prepaint"');
    expect(h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').length).toBeGreaterThan(2000);
  });

  it('an ordinary page still boots the app', async () => {
    const h = await html('/games');
    expect(moduleScripts(h).length).toBeGreaterThan(0);
    expect(modulePreloads(h).length).toBeGreaterThan(0);
  });
});

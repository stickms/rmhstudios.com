/**
 * s14-17: a moderator's timeout holds wherever a member writes text others read.
 *
 * Two source scans over `lib/moderation/restriction-paths.ts`. Both strip comments first and need a real call, so a
 * check named in a comment satisfies nothing.
 *  - ENFORCEMENT: every listed path calls a check that names its feature, or calls the guard that does.
 *  - WRITERS: every file that creates a row of member-written text is listed with what covers it, so a new writer
 *    that skips the check fails here.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MEMBER_TEXT_MODELS,
  RESTRICTION_ENFORCEMENT_PATHS,
  RESTRICTION_WRITERS,
} from '@/lib/moderation/restriction-paths';
import { RESTRICTABLE_FEATURES } from '@/lib/moderation/restrictions';

const ROOT = resolve(__dirname, '../../..');

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const readSource = (path: string): string => stripComments(readFileSync(join(ROOT, path), 'utf8'));

const SKIP_DIRS = new Set(['node_modules', '.git', '__tests__', 'generated', 'dist', '.output', '.cache', 'locales']);

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      if (SKIP_DIRS.has(name)) continue;
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.gen.ts')) out.push(rel);
    }
  };
  for (const dir of ['lib', 'features', 'server', 'app']) walk(dir);
  return out;
}

const CHECK_CALL = '(?:restrictionResponse|restrictionMessage|isRestricted|isRestrictedIn|isMemberRestricted)';
const callNaming = (feature: string) => new RegExp(`\\b${CHECK_CALL}\\(([^;]{0,240}?)['"]${feature}['"]`);

describe('restriction enforcement paths', () => {
  const byPath = new Map(RESTRICTION_ENFORCEMENT_PATHS.map((e) => [e.path, e]));

  it('lists each file once, with a feature that exists', () => {
    expect(byPath.size).toBe(RESTRICTION_ENFORCEMENT_PATHS.length);
    for (const e of RESTRICTION_ENFORCEMENT_PATHS) {
      expect(RESTRICTABLE_FEATURES as readonly string[], e.path).toContain(e.feature);
    }
  });

  it.each(RESTRICTION_ENFORCEMENT_PATHS.map((e) => [e.path, e] as const))(
    '%s checks its timeout before it writes',
    (_path, entry) => {
      const src = readSource(entry.path);
      if (entry.via) {
        // The guard is called here and its own file checks the same feature.
        expect(src, `${entry.path} never calls ${entry.via.guard}(`).toMatch(new RegExp(`\\b${entry.via.guard}\\(`));
        const home = byPath.get(entry.via.definedIn);
        expect(home, `${entry.via.definedIn} must be listed`).toBeDefined();
        expect(home?.feature).toBe(entry.feature);
        expect(readSource(entry.via.definedIn)).toMatch(new RegExp(`(?:function|const)\\s+${entry.via.guard}\\b`));
      } else {
        expect(src, `${entry.path} has no real check naming '${entry.feature}'`).toMatch(callNaming(entry.feature));
      }
    },
  );

  it('the check comes before the first write in a route handler', () => {
    // Order: after authentication, before any write. A write earlier in the file than the check is the failure.
    for (const e of RESTRICTION_ENFORCEMENT_PATHS) {
      if (e.via || !e.path.includes('/api/')) continue;
      const src = readSource(e.path);
      const check = src.search(callNaming(e.feature));
      const handlerStart = src.search(/\b(POST|PUT|PATCH)\s*:/);
      if (check === -1 || handlerStart === -1 || check < handlerStart) continue;
      const between = src.slice(handlerStart, check);
      expect(between, `${e.path}: a write runs before the timeout check`).not.toMatch(
        /\bprisma\.\w+\.(create|createMany|upsert)\(/,
      );
    }
  });

  it('every file that calls a timeout check is listed', () => {
    const calls = new RegExp(`\\b${CHECK_CALL}\\(`);
    const own = new Set([
      'lib/moderation/restrictions.server.ts',
      'lib/moderation/restrictions-core.ts',
      'server/shared/member-restrictions.ts',
    ]);
    const unlisted = sourceFiles().filter(
      (f) => !own.has(f) && !byPath.has(f) && calls.test(stripComments(readFileSync(join(ROOT, f), 'utf8'))),
    );
    expect(unlisted, 'list these in RESTRICTION_ENFORCEMENT_PATHS').toEqual([]);
  });
});

describe('writers of member text', () => {
  const writes = (model: string) => new RegExp(`\\.${model}\\.(?:create|createMany|createManyAndReturn|upsert)\\(`);
  const listed = new Map(RESTRICTION_WRITERS.map((w) => [w.path, w]));
  const enforced = new Set(RESTRICTION_ENFORCEMENT_PATHS.map((e) => e.path));

  it('no file creating a member-text row is missing from the registry', () => {
    const missing: string[] = [];
    for (const file of sourceFiles()) {
      const src = stripComments(readFileSync(join(ROOT, file), 'utf8'));
      const found = MEMBER_TEXT_MODELS.filter((m) => writes(m).test(src));
      if (found.length === 0) continue;
      const entry = listed.get(file);
      const absent = found.filter((m) => !entry?.models.includes(m));
      if (absent.length > 0) missing.push(`${file}: ${absent.join(', ')}`);
    }
    expect(missing, 'add each to RESTRICTION_WRITERS, covered by a checked path (or exempt with the reason)').toEqual(
      [],
    );
  });

  it('every listed writer still writes what it says, and names a real check', () => {
    for (const w of RESTRICTION_WRITERS) {
      const src = readSource(w.path);
      for (const m of w.models) expect(src, `${w.path} no longer creates ${m}`).toMatch(writes(m));
      if ('exempt' in w.enforcedBy) {
        expect(w.enforcedBy.exempt.length, `${w.path} needs a real reason`).toBeGreaterThan(20);
      } else {
        expect(w.enforcedBy.paths.length).toBeGreaterThan(0);
        for (const p of w.enforcedBy.paths) expect(enforced.has(p), `${p} is not an enforcement path`).toBe(true);
      }
    }
  });

  it('every model in the list is written by some listed file (no dead entries)', () => {
    for (const m of MEMBER_TEXT_MODELS) {
      expect(
        RESTRICTION_WRITERS.some((w) => w.models.includes(m)),
        `${m} has no writer in the registry`,
      ).toBe(true);
    }
  });
});

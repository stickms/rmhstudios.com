import { existsSync, globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Static rules for the RMH Med Schools public UI (Phase 3). The three route files are held to the bundle rule; every
 * ui file to the Steel and i18n rules the review would otherwise catch by eye.
 */
const ROUTES = ['index', 'live', '$slug'].map((n) => `app/routes/_site/rmh-medschool/${n}.tsx`);
const uiFiles = globSync('features/medschools/ui/**/*.tsx')
  .map(String)
  .filter((f) => !/\.test\./.test(f))
  .sort();
const read = (f: string) => readFileSync(f, 'utf8');
const routes = ROUTES.flatMap((f) => {
  try {
    return [[f, read(f)] as const];
  } catch {
    return []; // the routes land in Task 7 and 9; the rule applies as they appear
  }
});

describe('medschools ui rules', () => {
  it('finds the ui files', () => {
    expect(uiFiles.length).toBeGreaterThan(3);
  });

  it('a file that renders text uses useTranslation("medschools")', () => {
    for (const f of uiFiles.filter((f) => !f.includes('/charts/'))) {
      const src = read(f);
      if (/\bt\(/.test(src) || /useMedLabels/.test(src)) {
        expect(src, f).toMatch(/useTranslation\('medschools'\)|useMedLabels\(\)/);
      }
    }
  });

  it('has no JSX text literal between tags', () => {
    for (const f of uiFiles) {
      const literals = [...read(f).matchAll(/<\/?[A-Za-z][^<>]*[\w"'}/]>([^<>{}()=?:;]*[A-Za-z][^<>{}()=?:;]*)</g)].map(
        (m) => (m[1] ?? '').trim(),
      );
      expect(literals.filter(Boolean), f).toEqual([]);
    }
  });

  it('puts no {/* comment on the line before a t( call (i18next-parser skips it)', () => {
    for (const f of uiFiles) {
      const lines = read(f).split('\n');
      lines.forEach((line, i) => {
        if (/\bt\(/.test(line) && /\{\/\*.*\*\/\}\s*$/.test(lines[i - 1] ?? '')) {
          throw new Error(`${f}:${i + 1} has a JSX comment right before t()`);
        }
      });
    }
  });

  it('never calls fetch directly', () => {
    for (const f of uiFiles) expect(read(f), f).not.toMatch(/\bfetch\(/);
  });

  it('keeps to Steel on content', () => {
    for (const f of uiFiles) {
      const src = read(f);
      expect(src, f).not.toMatch(/surface-card|surface-panel|backdrop|shadow-|rounded-(xl|2xl|full)/);
      expect(src, f).not.toMatch(/font-(bold|extrabold)|uppercase|tracking-/);
    }
  });

  it('draws a raw <table only in charts, ActivityTab and InterviewsTab', () => {
    for (const f of uiFiles) {
      if (/\/charts\/|ActivityTab|InterviewsTab/.test(f)) continue;
      expect(read(f), f).not.toMatch(/<table/);
    }
  });

  it('keeps charts and d3 out of the route files', () => {
    for (const [f, src] of routes) {
      expect(src, f).not.toMatch(/ui\/charts|chart-geometry|d3-/);
    }
  });

  it('keeps createServerFn out of the query factories', () => {
    expect(read('features/medschools/medschools.queries.ts')).not.toContain('createServerFn');
  });

  it('is listed under Services and in site search, not the catalog (O1)', async () => {
    const manifest = (await import('../feature')).default;
    for (const r of manifest.routes) expect(existsSync(r), r).toBe(true);
    expect(manifest.listed).toBe(false);
    expect(manifest.catalog).toBeUndefined();
    expect(read('app/routes/_site/services/index.tsx')).toContain("href: '/rmh-medschool'");
    expect(read('lib/search/catalog.ts')).toContain("'/rmh-medschool'");
    expect(existsSync('features/medschools/catalog.ts')).toBe(false);
    expect(read('lib/catalog/index.ts')).not.toContain('medschools');
  });
});

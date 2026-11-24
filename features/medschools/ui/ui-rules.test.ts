import { existsSync, globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Static rules for the RMH Med Schools UI. The route files are held to the bundle rule; every ui file to the i18n,
 * no-fetch and app-tier rules the review would otherwise catch by eye. The pages are a full-screen app now (roadmap
 * item 11): the Steel content rules this file used to hold (no rounded, shadow, backdrop, uppercase) came out with the
 * tier move, and the app-tier rules below replace them: palette tokens only, no hex, no keyframes, nothing `fixed`.
 */
const ROUTES = ['index', 'live', '$slug', 'tracker', 'lists', 'ask', 'practice'].map(
  (n) => `app/routes/rmh-medschool/${n}.tsx`,
);
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

  it('keeps to the app tier: palette tokens only, no hex, no keyframes, nothing position: fixed', () => {
    const css = read('features/medschools/ui/medschools.css').replace(/\/\*[\s\S]*?\*\//g, '');
    // Every colour is an `--app-*` token declaration; any other hex means a colour that escaped the palette.
    const stray = css.split('\n').filter((l) => /#[0-9a-fA-F]{3,8}\b/.test(l) && !/^\s*--(app|site)-[\w-]+:/.test(l));
    expect(stray.filter((l) => !/^\s*(\/?\*|\*)/.test(l))).toEqual([]);
    expect(css).not.toMatch(/@keyframes|position:\s*fixed|!important/);
    for (const f of [...uiFiles, 'app/routes/rmh-medschool.tsx']) {
      const src = read(f);
      // No raw palette colour, no hex in markup, no fixed layer (iOS fills its bars from edge-pinned layers).
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{6}\b|\b(?:bg|text|border)-(?:red|blue|green|gray|slate|zinc)-\d/);
      expect(src, f).not.toMatch(/(?:className|class)=[^>]*\b(?:fixed|sticky)\b|position:\s*fixed/);
      expect(src, f).not.toMatch(/font-(bold|extrabold)/);
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

  it('keeps the private tracker route private and thin (noindex, definePage, prefetched, no zod)', () => {
    const src = read('app/routes/rmh-medschool/tracker.tsx');
    expect(src).toContain('noIndex: true');
    expect(src).toContain('definePage');
    expect(src).toContain('prefetchRouteQuery');
    expect(src).not.toMatch(/from 'zod'|ui\/charts|d3-/);
  });

  it('keeps the private lists route private and thin (noindex, definePage, prefetched, no zod)', () => {
    const src = read('app/routes/rmh-medschool/lists.tsx');
    expect(src).toContain('noIndex: true');
    expect(src).toContain('definePage');
    expect(src).toContain('prefetchRouteQuery');
    expect(src).not.toMatch(/from 'zod'|ui\/charts|d3-/);
  });

  it('keeps the ask route private and thin (noindex, definePage, no engine/qa, no zod, no charts)', () => {
    const src = read('app/routes/rmh-medschool/ask.tsx');
    expect(src).toContain('noIndex: true');
    expect(src).toContain('definePage');
    expect(src).not.toMatch(/from 'zod'|ui\/charts|d3-|engine\/qa/);
  });

  it('draws the activity rail with one IntersectionObserver, on the sentinel, through useSentinel (B3: data loading only)', () => {
    const src = read('features/medschools/ui/rail/ActivityRail.tsx');
    expect(src).toContain('useSentinel');
    expect(src).not.toMatch(/new (Intersection|Resize|Mutation)Observer|requestAnimationFrame/);
  });

  it('the app frame mounts the live rail itself; the Steel shell no longer hands it the margin', () => {
    expect(read('features/medschools/ui/shell/MedApp.tsx')).toContain("import('../rail/ActivityRail')");
    expect(read('components/shell/margin-takeover.ts')).not.toContain("prefix: '/rmh-medschool'");
  });

  it('is a top-level layout route with its own error and not-found frames and no auth gate', () => {
    const src = read('app/routes/rmh-medschool.tsx');
    expect(src).toContain("createFileRoute('/rmh-medschool')");
    expect(src).toContain('errorComponent');
    expect(src).toContain('notFoundComponent');
    expect(src).not.toMatch(/beforeLoad|createServerFn|redirect\(/);
    expect(existsSync('app/routes/_site/rmh-medschool')).toBe(false);
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

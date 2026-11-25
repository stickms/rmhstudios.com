import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The tracker import and the list import keep nothing about a file or its text: it is read in memory, sent to the model,
 * and gone. These read the source, because the thing to hold is the absence of a call. The one write each makes is what
 * the member saved: the tracker rows through the share-sync writer (`share-ratchet.test.ts`), the list items through
 * `lists.server.ts` (`importListItems`), neither of which is in these files.
 */
const PARSE_ENDPOINTS = [
  'features/medschools/api/medschools.me.tracker.import.parse.server.ts',
  'features/medschools/api/medschools.me.lists.import.parse.server.ts',
];
const files = [
  ...globSync('features/medschools/api/import/*.ts'),
  ...PARSE_ENDPOINTS,
  'features/medschools/api/medschools.me.tracker.import.save.server.ts',
  'features/medschools/api/medschools.me.lists.import.save.server.ts',
  'features/medschools/api/import-schemas.ts',
]
  .map(String)
  .filter((f) => !/\.test\./.test(f))
  .sort();
const code = (f: string) =>
  readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('import privacy pins (tracker and lists)', () => {
  it('finds the files, the list import among them', () => {
    expect(files.length).toBeGreaterThanOrEqual(14);
    for (const f of [
      'features/medschools/api/import/list-parse.server.ts',
      'features/medschools/api/import/list-validate.ts',
      'features/medschools/api/import/request.server.ts',
      'features/medschools/api/medschools.me.lists.import.parse.server.ts',
      'features/medschools/api/medschools.me.lists.import.save.server.ts',
    ]) {
      expect(files).toContain(f);
    }
  });

  it('writes nothing: no create, update, upsert, delete or raw write on any model', () => {
    for (const f of files) {
      expect(code(f), f).not.toMatch(/\b(prisma|tx)\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
      expect(code(f), f).not.toMatch(/\$executeRaw|\$queryRawUnsafe|writeFile|createWriteStream|appendFile/);
    }
  });

  it('caches nothing about a file: the one cache is the school directory under a constant key', () => {
    for (const f of files) {
      const src = code(f);
      if (f.endsWith('directory.server.ts')) {
        // The key is one constant string (never built from input), read through KEY for the fresh reload too.
        expect(src).toMatch(/const KEY = 'medschools:import:directory';/);
        expect(src).toMatch(/cached<Loaded>\(\s*KEY,/);
        expect(src).not.toMatch(/KEY\s*[+`]|`medschools:import/);
        continue;
      }
      expect(src, f).not.toMatch(/\bcached\w*\(|\blruL1\(|microCache|putL1\(|redis/i);
    }
  });

  it('logs no text: a console call never mentions the text, the file, rows, names or the output', () => {
    for (const f of files) {
      for (const m of code(f).matchAll(/console\.\w+\(([^;]*)\)/g)) {
        expect(m[1], `${f}: ${m[0]}`).not.toMatch(
          /\b(text|file|filename|buffer|raw|rows?|output|prompt|milestones?|names?|schools?|schoolName)\b/i,
        );
      }
    }
  });

  it('the file name is carried only to the extension check', () => {
    const named = files
      .filter((f) => /filename/.test(code(f)))
      .map((f) => f.split('/').pop())
      .sort();
    expect(named).toEqual(['extract.server.ts', 'parse.server.ts', 'request.server.ts'].sort());
  });

  it('both parse endpoints declare no cache and say no-store, through the shared request reader', () => {
    expect(code('features/medschools/api/import/request.server.ts')).toContain("'no-store'");
    for (const f of PARSE_ENDPOINTS) {
      const src = code(f);
      expect(src, f).not.toMatch(/\bcache\s*:/);
      expect(src, f).toMatch(/headers: NO_STORE/);
      expect(src, f).toContain('readImportRequest(userId, request)');
    }
  });

  it('the list import validates names against the text and never reads a slug from the model', () => {
    const src = code('features/medschools/api/import/list-validate.ts');
    expect(src).toMatch(/folded\.includes\(f\)/);
    expect(listModelKeys(code('features/medschools/api/import-schemas.ts'))).toEqual(['name', 'program']);
    expect(src).not.toMatch(/parsed\.data\.slug|\.data\.id\b/);
  });
});

/** The keys of `listModelRow`'s object, read from the source. */
function listModelKeys(src: string): string[] {
  const m = /export const listModelRow = z\.object\(\{([\s\S]*?)\}\);/.exec(src);
  return [...(m?.[1] ?? '').matchAll(/^\s*(\w+):/gm)].map((x) => x[1]!).sort();
}

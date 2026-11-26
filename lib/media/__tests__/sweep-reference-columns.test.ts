import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript-js';
import { describe, expect, it } from 'vitest';
import { SWEEP_REFERENCE_EXEMPT } from '@/lib/media/sweep-surfaces';

/**
 * The gate for picture columns (s11-18). The media sweep deletes stored objects, so a column that names an uploaded
 * picture must be known to it: named as a field in a Prisma `where` inside `referencedUrls` (found by parsing
 * `sweep.server.ts` with the TypeScript compiler API, never by a substring or a comment), or listed in
 * `SWEEP_REFERENCE_EXEMPT` with a reason. A new `heroImageUrl String?` on any model fails here until it is one or
 * the other; an exempt entry for a column that is gone, or that the sweep now names, fails too.
 */

const root = join(__dirname, '..', '..', '..');

/** Column names that hold an uploaded picture, sound or clip address. */
const PICTURE_COLUMN = /(image|images|imageUrls?|thumbnailUrl|coverUrl|bannerUrl|mediaUrls?|soundUrl|avatarUrl)$/i;

function schemaFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return schemaFiles(path);
    return name.endsWith('.prisma') ? [path] : [];
  });
}

/** `Model.field` for every `String`, `String?` or `String[]` column whose name matches, comments stripped. */
function pictureColumns(schemaSources: readonly string[]): string[] {
  const found: string[] = [];
  for (const source of schemaSources) {
    let model: string | null = null;
    for (const raw of source.split('\n')) {
      const line = raw.replace(/\/\/.*$/, '');
      const opens = /^\s*model\s+(\w+)\s*\{/.exec(line);
      if (opens) {
        model = opens[1]!;
        continue;
      }
      if (/^\s*\}/.test(line)) {
        model = null;
        continue;
      }
      const field = /^\s*(\w+)\s+String(\?|\[\])?(\s|$)/.exec(line);
      if (model && field && PICTURE_COLUMN.test(field[1]!)) found.push(`${model}.${field[1]}`);
    }
  }
  return [...new Set(found)].sort();
}

/** `Model.field` for every field named in a `where` of a Prisma call inside `referencedUrls`. */
function namedByReferencedUrls(sweepSource: string, models: readonly string[]): Set<string> {
  const file = ts.createSourceFile('sweep.server.ts', sweepSource, ts.ScriptTarget.Latest, true);
  const modelOf = new Map(models.map((m) => [m.charAt(0).toLowerCase() + m.slice(1), m] as const));
  const named = new Set<string>();

  const whereFields = (node: ts.Expression, out: string[]): void => {
    if (!ts.isObjectLiteralExpression(node)) return;
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
      if (key === 'OR' || key === 'AND' || key === 'NOT') {
        const value = prop.initializer;
        if (ts.isArrayLiteralExpression(value)) for (const el of value.elements) whereFields(el, out);
        else whereFields(value, out);
      } else if (key) out.push(key);
    }
  };

  const visitCalls = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.expression;
      if (ts.isPropertyAccessExpression(method)) {
        const delegate = method.name.text;
        const model = modelOf.get(delegate) ?? modelOf.get(delegate.charAt(0).toLowerCase() + delegate.slice(1));
        const arg = node.arguments[0];
        if (model && arg && ts.isObjectLiteralExpression(arg)) {
          for (const prop of arg.properties) {
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'where') {
              const fields: string[] = [];
              whereFields(prop.initializer, fields);
              for (const f of fields) named.add(`${model}.${f}`);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visitCalls);
  };

  const fn = file.statements.find(
    (s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === 'referencedUrls',
  );
  if (fn) visitCalls(fn);
  return named;
}

/** What is wrong, as sentences; empty when the gate holds. */
function gateProblems(
  columns: readonly string[],
  named: ReadonlySet<string>,
  exempt: Readonly<Record<string, string>>,
): string[] {
  const problems: string[] = [];
  for (const column of columns) {
    if (!named.has(column) && !(column in exempt)) {
      problems.push(
        `${column} names an uploaded picture but referencedUrls does not and SWEEP_REFERENCE_EXEMPT has no entry`,
      );
    }
  }
  for (const [column, reason] of Object.entries(exempt)) {
    if (!columns.includes(column)) problems.push(`${column} is exempt but no such picture column exists`);
    if (named.has(column)) problems.push(`${column} is exempt but referencedUrls names it`);
    if (reason.trim().length < 20) problems.push(`${column} has no real reason`);
  }
  return problems;
}

const schemaSources = schemaFiles(join(root, 'prisma/schema')).map((f) => readFileSync(f, 'utf8'));
const sweepSource = readFileSync(join(root, 'lib/media/sweep.server.ts'), 'utf8');
const models = schemaSources.flatMap((s) => [...s.matchAll(/^\s*model\s+(\w+)\s*\{/gm)].map((m) => m[1]!));

describe('picture columns and the media sweep', () => {
  const columns = pictureColumns(schemaSources);
  const named = namedByReferencedUrls(sweepSource, models);

  it('finds the columns the sweep already names', () => {
    for (const column of ['HomeListing.images', 'EmailCampaign.imageUrls', 'SiteEra.imageUrl', 'RMHark.imageUrls']) {
      expect(columns).toContain(column);
      expect(named.has(column), `${column} not found in referencedUrls`).toBe(true);
    }
  });

  it('knows every picture column: named by referencedUrls or exempt with a reason', () => {
    expect(gateProblems(columns, named, SWEEP_REFERENCE_EXEMPT)).toEqual([]);
  });

  describe('the gate itself', () => {
    const exempt = { 'Page.coverUrl': 'A third-party address the site never stores.' };

    it('fails a new column no one listed', () => {
      const schema = ['model Page {', '  id String @id', '  heroImageUrl String?', '}'].join('\n');
      const cols = pictureColumns([schema]);
      expect(cols).toEqual(['Page.heroImageUrl']);
      expect(gateProblems(cols, new Set(), {})).toHaveLength(1);
    });

    it('is not satisfied by a comment that names the column', () => {
      const source = [
        'export async function referencedUrls(deps: D, urls: string[]) {',
        '  // Page.heroImageUrl is kept: deps.prisma.page.findMany({ where: { heroImageUrl: { in: urls } } })',
        '  /* page: { where: { heroImageUrl: 1 } } */',
        '  return deps.prisma.other.findMany({ where: { id: { in: urls } } });',
        '}',
      ].join('\n');
      const got = namedByReferencedUrls(source, ['Page', 'Other']);
      expect(got.has('Page.heroImageUrl')).toBe(false);
      expect(got.has('Other.id')).toBe(true);
    });

    it('is satisfied by a field in a where, including inside OR', () => {
      const source = [
        'export async function referencedUrls(deps: D, urls: string[]) {',
        '  await deps.prisma.page.findMany({ where: { OR: [{ heroImageUrl: { in: urls } }, { coverUrl: { in: urls } }] } });',
        '}',
      ].join('\n');
      const got = namedByReferencedUrls(source, ['Page']);
      expect(got.has('Page.heroImageUrl')).toBe(true);
      expect(got.has('Page.coverUrl')).toBe(true);
    });

    it('fails a stale exempt entry, and one the sweep now names', () => {
      expect(gateProblems([], new Set(), exempt)).toEqual([
        'Page.coverUrl is exempt but no such picture column exists',
      ]);
      expect(gateProblems(['Page.coverUrl'], new Set(['Page.coverUrl']), exempt)).toEqual([
        'Page.coverUrl is exempt but referencedUrls names it',
      ]);
    });

    it('only counts String, String? and String[] columns, and ignores commented ones', () => {
      const schema = [
        'model Page {',
        '  imageCount Int',
        '  image String?',
        '  // thumbnailUrl String?',
        '  imageUrls String[]',
        '  coverUrl Json?',
        '}',
        'model Other {',
        '  avatarUrl String',
        '}',
      ].join('\n');
      expect(pictureColumns([schema])).toEqual(['Other.avatarUrl', 'Page.image', 'Page.imageUrls']);
    });
  });
});

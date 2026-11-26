/**
 * System notices are written as a key, not as bare English (sprint 09, feature 19).
 *
 * A `SYSTEM` notification the site writes carries a translation key and params beside its English sentence
 * (`notice('community-timeout-until', { … })`, `lib/notifications/notice-keys.ts`), so the inbox can show it in the
 * reader's language. An emitter that still hands `createNotification` (or `dispatch`, or a direct `notification.create`)
 * a bare string `preview` built from an English literal shows English to every reader.
 *
 * This counts those emitters: an object literal with `type: 'SYSTEM'` whose `preview` is a string or template literal
 * (or a conditional with one in a branch). It is a one-directional ratchet:
 *  - a new emitter written with a bare English string raises the count and fails, printing its file and line;
 *  - `REMAINING` is the documented set still to convert, as `path:count`. An entry that no longer matches fails, so
 *    a converted site cannot stay on the list, and the file's final count is what the sprint summary reports.
 *
 * Previews that quote member-written text (a post excerpt, a reminder's note, a guestbook entry) are an identifier or a
 * call, not a literal, and are not counted. Tests are not scanned.
 */
import { globSync, readFileSync } from 'node:fs';
import ts from 'typescript-js';
import { describe, expect, it } from 'vitest';

/** Emitters not yet converted, `path:count`. Only ever shrinks. */
const REMAINING: Record<string, number> = {};

/**
 * SYSTEM notices that reach `createNotification` through a helper or a variable, so the AST count above cannot see
 * them, and that are still English only. Each is named with the reason it stays; the list only shrinks, and the test
 * below fails an entry whose file no longer exists or has started to use `notice(`, so a converted site leaves it.
 * Quoted member text (a post excerpt, a reminder note, a guestbook entry, an update body, a recipe author's message)
 * is not a notice and is not listed; the emitter frames it in a key instead.
 *
 * Sprint 12 (feature 19) converted the last five (RMHLadder alerts, API key suspend and restore, the report decision,
 * the admins' review alerts, recipe messages); the list is empty and stays empty.
 */
const PASSED_THROUGH_HELPERS: Record<string, string> = {};

const ROOTS = ['lib', 'server', 'features', 'app', 'components', 'scripts'];

interface Site {
  file: string;
  line: number;
}

function isEnglishLiteral(node: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
    return isEnglishLiteral(node.expression);
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))
    return true;
  if (ts.isConditionalExpression(node)) return isEnglishLiteral(node.whenTrue) || isEnglishLiteral(node.whenFalse);
  // `` `…`.slice(0, 280) ``
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    return isEnglishLiteral(node.expression.expression);
  }
  return false;
}

function propName(p: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(p)) return null;
  return ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
}

function isSystemType(init: ts.Expression): boolean {
  let e = init;
  while (ts.isAsExpression(e) || ts.isParenthesizedExpression(e)) e = e.expression;
  return ts.isStringLiteral(e) && e.text === 'SYSTEM';
}

/** The `SYSTEM` emitters in one source text whose `preview` is a bare English literal. */
export function bareEmittersIn(file: string, source: string): Site[] {
  const sites: Site[] = [];
  if (!source.includes("'SYSTEM'")) return sites;
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const props = new Map<string, ts.Expression>();
      for (const p of node.properties) {
        const name = propName(p);
        if (name && ts.isPropertyAssignment(p)) props.set(name, p.initializer);
      }
      const type = props.get('type');
      const preview = props.get('preview');
      if (type && preview && isSystemType(type) && isEnglishLiteral(preview)) {
        sites.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

export function bareEnglishEmitters(): Site[] {
  const files = ROOTS.flatMap((root) => globSync(`${root}/**/*.{ts,tsx}`)).filter(
    (f) => !/(^|\/)(__tests__|node_modules)\//.test(f) && !/\.(test|spec)\.tsx?$/.test(f) && !f.endsWith('.d.ts'),
  );
  return files.sort().flatMap((file) => bareEmittersIn(file, readFileSync(file, 'utf8')));
}

describe('SYSTEM notices are written as keys, not bare English', () => {
  const sites = bareEnglishEmitters();
  const byFile = new Map<string, Site[]>();
  for (const s of sites) byFile.set(s.file, [...(byFile.get(s.file) ?? []), s]);

  it('has no emitter beyond the documented remainder', () => {
    const extra = [...byFile].filter(([file, list]) => list.length > (REMAINING[file] ?? 0));
    expect(
      extra.map(([file, list]) => `${file}: ${list.map((s) => s.line).join(', ')}`),
      'a SYSTEM notice passes a bare English preview: use notice(key, params) from @/lib/notifications/notice-keys',
    ).toEqual([]);
  });

  it('lists no converted site (the remainder only shrinks)', () => {
    const stale = Object.entries(REMAINING).filter(([file, count]) => (byFile.get(file)?.length ?? 0) < count);
    expect(stale, 'lower or remove these REMAINING entries').toEqual([]);
  });

  it('has no notice that reaches createNotification through a helper in English', () => {
    expect(Object.keys(PASSED_THROUGH_HELPERS)).toEqual([]);
    for (const file of Object.keys(PASSED_THROUGH_HELPERS)) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} now uses notice(): remove it from PASSED_THROUGH_HELPERS`).not.toMatch(/\bnotice\(/);
    }
  });

  it('the five helper emitters of sprint 12 (19) write their notices as keys', () => {
    for (const file of [
      'lib/rmhladder/alerts/dispatch.server.ts',
      'lib/admin-review.server.ts',
      'lib/moderation/triage.server.ts',
      'lib/admin/api-keys.server.ts',
      'lib/developer/recipes.server.ts',
    ]) {
      const source = readFileSync(file, 'utf8');
      // admin-review.server.ts receives its notice from the seven callers; the others build it.
      expect(source, file).toMatch(file.includes('admin-review') ? /notice: NoticePreview/ : /\bnotice\(/);
    }
  });

  it('reports the count the sprint summary quotes', () => {
    const total = Object.values(REMAINING).reduce((a, b) => a + b, 0);
    expect(sites.length).toBe(total);
  });

  it('catches a bare English preview, in each shape, and passes a key or a variable', () => {
    const count = (src: string) => bareEmittersIn('x.ts', src).length;
    const wrap = (preview: string) => `createNotification({ userId, type: 'SYSTEM', preview: ${preview} });`;
    expect(count(wrap('`Your post ${x} was removed`'))).toBe(1);
    expect(count(wrap("'Your post was removed'"))).toBe(1);
    expect(count(wrap("ok ? 'a' : notice('b', {})"))).toBe(1);
    expect(count(wrap('`Hi ${x}`.slice(0, 280)'))).toBe(1);
    expect(count(wrap("notice('level-reached', { level })"))).toBe(0);
    expect(count(wrap('post.excerpt'))).toBe(0);
    expect(count("createNotification({ type: 'LIKE', preview: 'x' });")).toBe(0);
  });
});

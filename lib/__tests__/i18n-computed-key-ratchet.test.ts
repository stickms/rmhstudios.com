/**
 * No translation key is built at run time (sprint 04, feature 15).
 *
 * `pnpm i18n:extract` (i18next-cli) reads only string-literal keys. A key
 * written as ``t(`notification-verb-${type}`)`` or `t('tab-' + id)` is
 * invisible to it, so the key never reaches `locales/en/<ns>.json`, the
 * translation pipeline never sends it, and every locale but English silently
 * shows the `defaultValue`. The fix is a literal label map beside the
 * component (`components/settings/settings-nav-labels.ts` is the pattern): a
 * function taking `t` and returning a record of literal `t('key', …)` calls,
 * with a test holding it equal to its source list.
 *
 * This test counts, under `app/`, `components/` and `features/`, every call of
 * a translate function (the names the extractor is configured to follow) whose
 * first argument is a template literal with a substitution or a string
 * concatenation, and every `<Trans i18nKey={…}>` built the same way. It is a
 * one-directional ratchet:
 *  - a new computed key fails and prints its file and line;
 *  - `ALLOWED` is the documented list of unavoidable cases. It starts empty and
 *    may only shrink: an entry that no longer matches a call fails the test, so
 *    a fixed site cannot stay on the list.
 *
 * A key carried as a variable (`t(item.key)`) is not counted: the extractor
 * cannot see it either, but the list that carries it is its own source of keys.
 * Tests and `__tests__` are not scanned.
 */
import { globSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Unavoidable computed keys, as `path:count`. Empty: every site has a literal
 * label map. Never add to it; remove an entry when its site is fixed.
 */
const ALLOWED: Record<string, number> = {};

// The names the extractor follows (`t`, `ts`, `tn`, …): a computed key under any of them is invisible.
const extractorConfig = (await import('../../i18next.config')).default as { extract: { functions: string[] } };
const TRANSLATE_FUNCTIONS: ReadonlySet<string> = new Set(extractorConfig.extract.functions);

interface Computed {
  file: string;
  line: number;
  text: string;
}

function isComputed(node: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return isComputed(node.expression);
  if (ts.isTemplateExpression(node)) return true;
  // `t(cond ? 'a' : 'b')` is invisible too: the extractor warns "Key is not a string literal" and skips it.
  if (ts.isConditionalExpression(node)) return true;
  if (!ts.isBinaryExpression(node)) return false;
  const op = node.operatorToken.kind;
  return (
    op === ts.SyntaxKind.PlusToken ||
    op === ts.SyntaxKind.BarBarToken ||
    op === ts.SyntaxKind.QuestionQuestionToken ||
    op === ts.SyntaxKind.AmpersandAmpersandToken
  );
}

function calleeName(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  // `i18n.t(…)` and `props.t(…)`
  if (ts.isPropertyAccessExpression(expr) && expr.name.text === 't') return 't';
  return null;
}

function scan(file: string, source: string): Computed[] {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: Computed[] = [];
  const report = (node: ts.Node) =>
    found.push({
      file,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      text: node.getText(sf).replace(/\s+/g, ' ').slice(0, 90),
    });
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      const first = node.arguments[0];
      if (name && TRANSLATE_FUNCTIONS.has(name) && first && isComputed(first)) report(node);
    } else if (
      ts.isJsxAttribute(node) &&
      node.name.getText(sf) === 'i18nKey' &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression &&
      isComputed(node.initializer.expression)
    ) {
      report(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function scanTree(): Computed[] {
  const files = globSync('{app,components,features}/**/*.{ts,tsx}', {
    exclude: (f) => /node_modules|__tests__|\.test\.|routeTree\.gen/.test(String(f)),
  });
  const all: Computed[] = [];
  for (const file of files.sort()) {
    const source = readFileSync(file, 'utf8');
    // Cheap filter: a computed key needs a template, concatenation, ternary or fallback next to a call.
    if (!/[`+?|&]/.test(source)) continue;
    all.push(...scan(file, source));
  }
  return all;
}

describe('computed translation keys', () => {
  const found = scanTree();

  it('finds no computed key beyond the allowlist', () => {
    const perFile = new Map<string, Computed[]>();
    for (const c of found) perFile.set(c.file, [...(perFile.get(c.file) ?? []), c]);
    const over = [...perFile].filter(([file, list]) => list.length > (ALLOWED[file] ?? 0));
    const message = over.flatMap(([, list]) => list.map((c) => `${c.file}:${c.line}  ${c.text}`)).join('\n');
    expect(
      message,
      'A translation key must be a string literal, or `pnpm i18n:extract` never sees it and every locale but English shows the default. ' +
        'Write the keys out in a literal label map (components/settings/settings-nav-labels.ts is the pattern):\n' +
        message,
    ).toBe('');
  });

  it('keeps the allowlist honest: every entry still matches a call', () => {
    for (const [file, count] of Object.entries(ALLOWED)) {
      const now = found.filter((c) => c.file === file).length;
      expect(now, `${file} is allowlisted for ${count} computed key(s) but has ${now}; lower or remove the entry`).toBe(
        count,
      );
    }
  });

  it('recognises the shapes it forbids', () => {
    const samples = [
      'const a = t(`kind-${k}`, { defaultValue: "x" });',
      'const a = t("kind-" + k);',
      'const a = i18n.t(`kind-${k}`);',
      'const a = tn(`kind-${k}`);',
      'const a = <Trans i18nKey={`kind-${k}`} />;',
      'const a = t(on ? "kind-a" : "kind-b");',
      'const a = t(k ?? "kind-a");',
      'const a = <Trans i18nKey={on ? "kind-a" : "kind-b"} />;',
    ];
    for (const code of samples) expect(scan('sample.tsx', code), code).toHaveLength(1);
    const fine = [
      'const a = t("kind-red", { defaultValue: `Red ${x}` });',
      'const a = t(item.key, { defaultValue: "x" });',
      'const a = other(`kind-${k}`);',
      '// t(`kind-${k}`)\nconst a = 1;',
      'const a = t(`kind-red`);',
    ];
    for (const code of fine) expect(scan('sample.tsx', code), code).toHaveLength(0);
  });
});

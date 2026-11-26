/**
 * `serverError(` call sites only go DOWN (sprint 10, feature 20).
 *
 * `serverError(error)` (`lib/http.ts`) shows the server's English. A refusal now carries a taxonomy `code`
 * (`lib/errors/codes.ts`), and `useRefusalText()` (`components/errors/useRefusalText.ts`) renders it from the
 * `errors` namespace in the reader's language, falling back to `serverError` for a body with no code. New code calls
 * the hook, not `serverError`.
 *
 * This is a one-directional ratchet, like the other backlogs in this folder:
 *  - a NEW `serverError(` call fails (count above the baseline): use `useRefusalText`;
 *  - converting some fails too until BASELINE is lowered to the new count, so the backlog cannot quietly grow
 *    back into the space you freed.
 *
 * The count reads each file's syntax tree, so a call in a comment or a string is not a call. The hook's own fallback
 * (`components/errors/useRefusalText.ts`) is excluded, and so are tests.
 */
import { globSync, readFileSync } from 'node:fs';
import ts from 'typescript-js';
import { describe, expect, it } from 'vitest';

/** Lower this when you convert call sites. Never raise it. */
const BASELINE = 17;

const HOOK = 'components/errors/useRefusalText.ts';

function countServerErrorCalls(source: string, fileName = 'file.tsx'): number {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let n = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'serverError') n += 1;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return n;
}

function scan(): { total: number; top: [string, number][] } {
  const files = globSync('{app,components,features}/**/*.{ts,tsx}', {
    exclude: (f) => /node_modules|__tests__|\.test\.|routeTree\.gen/.test(String(f)),
  });
  let total = 0;
  const per: [string, number][] = [];
  for (const f of files) {
    const path = String(f);
    if (path === HOOK) continue;
    const n = countServerErrorCalls(readFileSync(path, 'utf8'), path);
    if (n) {
      total += n;
      per.push([path, n]);
    }
  }
  per.sort((a, b) => b[1] - a[1]);
  return { total, top: per.slice(0, 10) };
}

describe('serverError( ratchet', () => {
  it('counts calls, not comments or strings', () => {
    const source = [
      '// serverError(e) in a comment',
      "const s = 'serverError(e)';",
      '/* serverError(e) */',
      'const a = serverError(e);',
      'const b = x.serverError(e);',
    ].join('\n');
    expect(countServerErrorCalls(source)).toBe(1);
  });

  it('does not grow and is lowered as it shrinks', { timeout: 60_000 }, () => {
    const { total, top } = scan();
    const hint = `\nLargest: ${top.map(([f, n]) => `${f} (${n})`).join(', ')}`;
    expect(total, `serverError( call sites grew: use useRefusalText().${hint}`).toBeLessThanOrEqual(BASELINE);
    expect(
      total,
      `serverError( call sites fell to ${total}: lower BASELINE to ${total}.${hint}`,
    ).toBeGreaterThanOrEqual(BASELINE);
  });
});

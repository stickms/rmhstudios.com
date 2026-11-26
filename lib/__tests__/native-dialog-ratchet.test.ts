import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript-js';

/**
 * No browser dialogs. `window.prompt`, `window.confirm` and `alert` are suppressed in a sandboxed
 * iframe without `allow-modals` (the Discord activity), cannot be translated or themed, and stop the
 * page's event loop while open (realtime sockets stall). The site's own dialogs replace them:
 * `useConfirm`, `usePrompt` and `useCopyFallback` from `components/ui/`, or `toast` for a message.
 *
 * Found by syntax, not by text, so a string that merely contains `alert(1)` is not a call. A call is
 * `window.`/`globalThis.`/`self.` `prompt|confirm|alert`, or the bare global name when the file does
 * not declare that name itself (`const confirm = useConfirm()` is not the global).
 *
 * {@link ALLOW} only shrinks: an entry that no longer has a native call fails the test so it is
 * deleted, and a new entry needs a reason a reviewer can weigh.
 */
const ROOTS = ['app', 'components', 'features'];
const NATIVE = new Set(['prompt', 'confirm', 'alert']);
const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self']);

/** Path prefix (posix) -> why it may keep native dialogs. */
const ALLOW: Record<string, string> = {
  'components/velum2099/game/':
    'Frozen, @ts-nocheck port of a standalone simulation; its data exporter alerts in Chinese and is out of scope (sprint 04 feature 19).',
};

const root = join(__dirname, '..', '..');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') out.push(...sources(path));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(path);
    }
  }
  return out;
}

function bindingNames(name: ts.BindingName, into: Set<string>): void {
  if (ts.isIdentifier(name)) {
    into.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) bindingNames(element.name, into);
  }
}

/** The native dialog calls in one file, as `name@line`. */
export function nativeDialogCalls(path: string, text: string): string[] {
  // Parsing every file is slow; only a file that mentions one of the names can call it.
  if (!/\b(prompt|confirm|alert)\b/.test(text)) return [];
  const kind = path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const declared = new Set<string>();
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) bindingNames(node.name, declared);
    else if (ts.isFunctionDeclaration(node) && node.name) declared.add(node.name.text);
    else if (ts.isImportSpecifier(node) || ts.isImportClause(node) || ts.isNamespaceImport(node)) {
      if (node.name) declared.add(node.name.text);
    } else if (ts.isCallExpression(node)) calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);

  const found: string[] = [];
  for (const call of calls) {
    const callee = call.expression;
    let name: string | null = null;
    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      GLOBAL_OBJECTS.has(callee.expression.text) &&
      NATIVE.has(callee.name.text)
    ) {
      name = callee.name.text;
    } else if (ts.isIdentifier(callee) && NATIVE.has(callee.text) && !declared.has(callee.text)) {
      name = callee.text;
    }
    if (name) found.push(`${name}@${file.getLineAndCharacterOfPosition(call.getStart()).line + 1}`);
  }
  return found;
}

describe('native browser dialogs', () => {
  it('finds window and bare calls, and ignores names the file declares and text', () => {
    expect(nativeDialogCalls('a.ts', "window.prompt('x'); alert('y'); globalThis.confirm('z');")).toEqual([
      'prompt@1',
      'alert@1',
      'confirm@1',
    ]);
    expect(
      nativeDialogCalls('a.tsx', "const confirm = useConfirm(); await confirm({ title: 'x' }); const s = 'alert(1)';"),
    ).toEqual([]);
    expect(nativeDialogCalls('a.ts', 'function f(prompt: P) { return prompt({}); }')).toEqual([]);
    expect(nativeDialogCalls('a.ts', 'foo.alert(1); toast.error(2);')).toEqual([]);
  });

  it('has none under app/, components/ or features/ outside the allowlist', () => {
    const offenders: string[] = [];
    for (const dir of ROOTS) {
      for (const path of sources(dir)) {
        const rel = relative(root, join(root, path)).split(sep).join('/');
        if (Object.keys(ALLOW).some((prefix) => rel.startsWith(prefix))) continue;
        for (const hit of nativeDialogCalls(rel, readFileSync(join(root, path), 'utf8'))) {
          offenders.push(`${rel}:${hit}`);
        }
      }
    }
    expect(
      offenders,
      'use useConfirm / usePrompt / useCopyFallback from components/ui or toast from @/lib/toast',
    ).toEqual([]);
  }, 60_000);

  it('keeps every allowlist entry honest', () => {
    for (const prefix of Object.keys(ALLOW)) {
      const files = ROOTS.flatMap(sources).filter((p) => p.startsWith(prefix));
      const hits = files.flatMap((p) => nativeDialogCalls(p, readFileSync(join(root, p), 'utf8')));
      expect(hits.length, `${prefix} no longer calls a native dialog: remove it from ALLOW`).toBeGreaterThan(0);
    }
  }, 60_000);
});

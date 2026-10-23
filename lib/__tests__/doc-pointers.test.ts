/**
 * Every pointer the gates print leads somewhere (gate N8, docs/plasmatic-jelly/05-gates-docs-naming.md §2).
 *
 * When a gate fails, the text it prints is the only guidance the person (or agent) fixing it gets: "see
 * docs/design-language.md §13", "decorative light belongs to lib/jelly…". The Plasmatic Jelly cutover renamed,
 * superseded or deleted several files those pointers named (`hooks/useFluidPress.ts`, the /liquid-glass demo, the
 * Liquid Glass contract). A pointer to a file that no longer exists is how a gate gets "fixed" the wrong way —
 * someone cannot find the rule, so they work around it.
 *
 * Scope: every repo path quoted in `scripts/check-consistency.sh` and `.claude/hooks/commit-gate.sh` (the text they
 * print), and every repo path inside a STRING LITERAL of the executable gates the commit gate runs (`GATE_TESTS`,
 * parsed from the script) — i.e. failure messages and allowlist reasons, not docblock history, which may legitimately
 * name a file that was deleted.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');

const SCRIPT = 'scripts/check-consistency.sh';
const HOOK = '.claude/hooks/commit-gate.sh';

/** `GATE_TESTS=( … )` in the commit gate: file paths (directories are vitest filters too). */
const GATE_TESTS = (() => {
  const src = read(SCRIPT);
  const start = src.indexOf('GATE_TESTS=(');
  const block = src.slice(start, src.indexOf('\n  )', start));
  return [...block.matchAll(/^\s+([\w./-]+)\s*$/gm)].map((m) => m[1]);
})();

/** A repo-relative path to a file with an extension, under a top-level directory that exists in this repo. */
const PATH =
  /(?<![\w./-])((?:docs|lib|app|components|hooks|scripts|testing|stores|server|deploy|prisma|public|\.claude|\.github)\/[\w.@$[\]/-]*\.(?:md|ts|tsx|mjs|js|css|sh|json|yml|yaml))(?![\w/-])/g;

function pathsIn(text: string): string[] {
  return [...new Set([...text.matchAll(PATH)].map((m) => m[1]))].filter(
    (p) => !/[*<>{}]/.test(p) && !p.includes('/<'),
  );
}

/** String-literal contents only: '…', "…" and `…` (template holes dropped). */
function literals(src: string): string {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  return [...noComments.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)]
    .map((m) => m[1] ?? m[2] ?? m[3] ?? '')
    .join('\n');
}

describe('N8 — the gates point at files that exist', () => {
  it('finds the gate list and the pointers at all', () => {
    expect(GATE_TESTS.length).toBeGreaterThan(20);
    expect(GATE_TESTS).toContain('lib/__tests__/design-consistency.test.ts');
    expect(GATE_TESTS).toContain('lib/__tests__/doc-pointers.test.ts');
    expect(pathsIn(read(SCRIPT)).length).toBeGreaterThan(5);
  });

  it('every gate the commit gate runs exists (a missing file is a silently skipped gate)', () => {
    expect(GATE_TESTS.filter((f) => !existsSync(join(ROOT, f)))).toEqual([]);
  });

  it.each([SCRIPT, HOOK])('every path %s prints exists', (file) => {
    const missing = pathsIn(read(file)).filter((p) => !existsSync(join(ROOT, p)));
    expect(missing, `${file} points at files that are gone — repoint them`).toEqual([]);
  });

  it('every path quoted in a gate test failure message or allowlist reason exists', () => {
    const missing: string[] = [];
    for (const gate of GATE_TESTS.filter((f) => /\.test\.tsx?$/.test(f))) {
      if (!existsSync(join(ROOT, gate))) continue;
      for (const p of pathsIn(literals(read(gate)))) {
        if (!existsSync(join(ROOT, p))) missing.push(`${gate} → ${p}`);
      }
    }
    expect(
      missing,
      'A gate tells its reader to look at a file that does not exist. Point it at the current owner ' +
        '(docs/plasmatic-jelly-system.md for the material, lib/jelly/** for the services).',
    ).toEqual([]);
  });
});

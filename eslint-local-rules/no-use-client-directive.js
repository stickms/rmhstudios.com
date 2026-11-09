/**
 * `local/no-use-client-directive` — no `'use client'` directives.
 *
 * `'use client'` is a React Server Components directive that Next.js reads.
 * This site runs on TanStack Start, where every route module is rendered on
 * the server AND hydrated on the client; the directive does nothing at all.
 *
 * It is not harmless, though. 1,536 files carried it (left over from the
 * Next.js era), and it reads as a claim — "this is a client component, so the
 * files without it are server components" — that is false here. Agents and
 * people both planned against that false claim. Server-only code is marked by
 * the `.server.ts` filename (stubbed out of the client bundle by the Vite
 * plugin in `vite.config.ts`), not by a directive.
 *
 * Removed in one codemod (redesign audit item A8,
 * `docs/plans/2026-11-09-ground-up-redesign-audit.md`); this rule keeps it out.
 * Autofix deletes the directive.
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "Disallow 'use client' / 'use server' directives: they are Next.js/RSC markers with no effect in TanStack Start",
    },
    fixable: 'code',
    schema: [],
    messages: {
      noDirective:
        "'{{value}}' does nothing in TanStack Start. Server-only code is marked by a `.server.ts` filename instead.",
    },
  },
  create(context) {
    return {
      Program(program) {
        for (const stmt of program.body) {
          if (stmt.type !== 'ExpressionStatement' || !stmt.directive) break;
          if (stmt.directive !== 'use client' && stmt.directive !== 'use server') continue;
          context.report({
            node: stmt,
            messageId: 'noDirective',
            data: { value: stmt.directive },
            fix: (fixer) => fixer.remove(stmt),
          });
        }
      },
    };
  },
};

export default rule;

/**
 * `local/route-needs-head` — every page route declares a `head()`.
 *
 * A TanStack Start route that renders a `component` but has no `head` key ships
 * with the root's generic title/description: no per-page title, canonical or
 * Open Graph block, and (for private pages) no `noindex`. Redesign audit item
 * F8 (docs/plans/2026-11-09-ground-up-redesign-audit.md).
 *
 * Not flagged: layout routes (`_*.tsx`, `route.tsx`, `__root.tsx`), and routes
 * with no `component` (redirect-only routes, API routes).
 */

import path from 'node:path';

/** @param {string} filename */
export function isLayoutRouteFile(filename) {
  const base = path.basename(filename);
  return base.startsWith('_') || base === 'route.tsx';
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require a head() on page routes that render a component',
    },
    schema: [],
    messages: {
      missingHead:
        'Page route has a `component` but no `head()`. Add one with buildMeta / gameRouteHead / appRouteHead (or noindexHead() for private pages).',
    },
  },
  create(context) {
    if (isLayoutRouteFile(context.filename)) return {};
    return {
      CallExpression(node) {
        // createFileRoute('/x')({ ... })
        const callee = node.callee;
        if (
          callee.type !== 'CallExpression' ||
          callee.callee.type !== 'Identifier' ||
          callee.callee.name !== 'createFileRoute'
        )
          return;
        const arg = node.arguments[0];
        if (!arg || arg.type !== 'ObjectExpression') return;
        const keys = new Set();
        for (const p of arg.properties) {
          if (p.type !== 'Property') {
            if (p.type === 'SpreadElement') keys.add('*spread');
            continue;
          }
          if (p.key.type === 'Identifier') keys.add(p.key.name);
          else if (p.key.type === 'Literal') keys.add(String(p.key.value));
        }
        if (!keys.has('component')) return;
        if (keys.has('head') || keys.has('*spread')) return;
        context.report({ node: arg, messageId: 'missingHead' });
      },
    };
  },
};

export default rule;

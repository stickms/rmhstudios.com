/**
 * `local/no-lucide-namespace-import` — never reach lucide's icon set as a
 * namespace or as its `icons` export.
 *
 * ## What this is protecting
 *
 * On 2026-08-11 the build carried a single 431 KB (116 KB gzip) `icons-*` chunk
 * holding ~1,400 lucide exports, plus a 157 KB barrel chunk, and both were
 * fetched on a cold anonymous load of the homepage. That is more bytes than
 * React, and it was there to render about a dozen icons.
 *
 * The cause was four files — not the "552 files each import a few icons" the
 * 2026-08-09 audit assumed — doing this:
 *
 * ```ts
 * import * as Icons from 'lucide-react';
 * const Cmp = Icons[name] ?? Icons.Smile;        // ← unshakeable
 * ```
 *
 * ```ts
 * import { icons } from 'lucide-react';
 * const Cmp = icons[pascalName];                 // ← the same thing
 * ```
 *
 * **A namespace object indexed by a computed key cannot be tree-shaken.** The
 * bundler cannot prove which members are reachable, so it must retain every one;
 * and because the namespace is a single module node shared by hundreds of
 * importers, it must be emitted as its own shared chunk that every one of those
 * routes then downloads in full. The named `icons` export is the same hazard in
 * a named-import costume — lucide's barrel is literally
 * `import * as index from './icons/index.mjs'; export { index as icons }`.
 *
 * Replacing those four lookups with explicit `Record<string, LucideIcon>` maps
 * deleted both chunks from the build outright, cut requests on `/` from 533 to
 * 382, and left a 1.4 KB shared factory behind. Full write-up:
 * `docs/loading-audit-2026-08-11/02-critical-path.md` §1.
 *
 * ## Why it needs a rule rather than a note
 *
 * The regression is **silent**. It costs bytes, not correctness: nothing errors,
 * no test fails, every icon renders. It reached production four separate times
 * before anyone measured it, and the 08-04 audit's written rule about keeping zod
 * out of shell modules was re-broken twice, which is the evidence that a
 * sentence in a doc is not a control.
 *
 * ## What to do instead
 *
 * Ordinary named imports are fine and tree-shake correctly — `import { Search, X }
 * from 'lucide-react'` is the normal case and is not flagged. When an icon name
 * arrives as *data* (a registry field, a catalog entry, a DB column), write the
 * map out. Three existing examples to copy:
 *
 *   • `components/home/layout-icons.ts`      → `iconFor(name)`
 *   • `components/site/CommandPalette.tsx`   → `DESTINATION_ICONS`
 *   • `components/rmhbox/minigame-icons.ts`  → `MINIGAME_ICONS`
 *
 * The name set is always bounded in practice, because something has to have
 * produced it.
 *
 * ## Escape hatch
 *
 * There isn't a good one, which is deliberate — the whole point is that the
 * cheap-looking version costs 431 KB. A genuinely unbounded, user-supplied icon
 * name wants a server-side allowlist and a per-icon dynamic `import()`, not the
 * whole set. Reported at **error**: unlike the user-select rule, this has no
 * backlog to work through — the four sites are fixed, so the count is zero and
 * the only direction it can move is up.
 */

const LUCIDE = 'lucide-react';

/** The barrel's own namespace-shaped export. */
const NAMESPACE_EXPORT = 'icons';

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        "disallow `import * as X from 'lucide-react'` and its `icons` export — both retain all ~1,400 icons in one chunk",
    },
    schema: [],
    messages: {
      namespace:
        "Namespace import of '{{source}}' retains ALL ~1,400 icons in one shared chunk (431 KB / 116 KB gzip) for every page that reaches this module — a namespace indexed by a computed key cannot be tree-shaken. Import the icons you name, and for icon names that arrive as data use an explicit Record<string, LucideIcon> map (see components/home/layout-icons.ts or components/rmhbox/minigame-icons.ts).",
      iconsExport:
        "The `icons` export of '{{source}}' IS a namespace object (`import * as index from './icons/index.mjs'`), so importing it retains all ~1,400 icons in one shared chunk. Use an explicit Record<string, LucideIcon> map instead (see components/rmhbox/minigame-icons.ts).",
    },
  },

  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        // Match the package and any deep path into it, so a future
        // `lucide-react/dist/esm/icons/index.mjs` namespace import is caught too.
        if (typeof source !== 'string') return;
        if (source !== LUCIDE && !source.startsWith(`${LUCIDE}/`)) return;

        for (const spec of node.specifiers) {
          if (spec.type === 'ImportNamespaceSpecifier') {
            context.report({ node: spec, messageId: 'namespace', data: { source } });
            continue;
          }
          // `import { icons }` / `import { icons as x }`. `importKind === 'type'`
          // is a type-only specifier and is erased, so it costs nothing.
          if (
            spec.type === 'ImportSpecifier' &&
            spec.imported.type === 'Identifier' &&
            spec.imported.name === NAMESPACE_EXPORT &&
            spec.importKind !== 'type' &&
            node.importKind !== 'type'
          ) {
            context.report({ node: spec, messageId: 'iconsExport', data: { source } });
          }
        }
      },
    };
  },
};

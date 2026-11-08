/** Compile-time hover policy for site and app CSS, including nested Tailwind variants.
 * Quiet colour feedback complements the material, and expensive hover shadows/filters
 * are stripped; content reveals and focus states remain intact.
 *
 * A host's own `:hover` transform (`transform`, `translate`, `rotate`, `scale`) is still
 * stripped, but no longer because hosts never move: under Plasmatic Jelly the soft body
 * OWNS hover motion. It is CSS now (app/jelly-material.css §8, CSS-first jelly PR 3): the
 * hover plump and dent are `scale: var(--jelly-hover-*)` on the jelly hosts, sprung by the
 * generated `--spring-*` curves. A hand-written hover `scale` would be a second writer on
 * the same property, fighting that spring. One writer per property is the invariant this
 * plugin enforces, so the one sanctioned writer is let through: a `scale` / `translate`
 * whose whole value is a `--jelly-hover-*` pose token (see {@link jellyPose}).
 */
import type { Declaration, Plugin, Rule } from 'postcss';
import selectorParser from 'postcss-selector-parser';

function hoverSelector(selector: string): { quiet: string; hover: boolean; own: boolean } {
  if (!selector.includes(':hover')) return { quiet: selector, hover: false, own: false };
  let hover = false;
  let own = false;
  const quiet = selectorParser((root) => {
    root.walkPseudos((pseudo) => {
      if (pseudo.value !== ':hover') return;
      let ancestor = pseudo.parent;
      while (ancestor && ancestor.type !== 'root') {
        // :not(:hover) describes the resting state, not an interaction to replace.
        if (ancestor.type === 'pseudo' && ancestor.value === ':not') return;
        ancestor = ancestor.parent;
      }
      hover = true;
      let compound: selectorParser.Node = pseudo;
      while (
        compound.parent &&
        !(compound.parent.type === 'selector' && compound.parent.parent?.type === 'root')
      )
        compound = compound.parent as selectorParser.Node;
      const nodes = compound.parent?.nodes ?? [];
      own ||=
        !nodes.some((n) => n.type === 'pseudo' && n.value.startsWith('::')) &&
        !nodes.slice(nodes.indexOf(compound) + 1).some((n) => n.type === 'combinator');
      // An impossible branch preserves :is(:hover,:focus-visible) and mixed
      // selector lists without allowing hover to change the focus state's ink.
      const guard = selectorParser.pseudo({
        value: ':not',
        nodes: [
          selectorParser.selector({
            value: '',
            nodes: [selectorParser.universal({ value: '*' })],
          }),
        ],
      });
      const pseudoElement = nodes.find((n) => n.type === 'pseudo' && n.value.startsWith('::'));
      if (pseudoElement && nodes.indexOf(pseudoElement) < nodes.indexOf(compound)) {
        // State pseudo-classes may follow a pseudo-element (scrollbar-thumb:hover),
        // but :not(*) may not. Put the impossible host guard before the element.
        pseudoElement.parent?.insertBefore(pseudoElement, guard);
        pseudo.remove();
      } else pseudo.replaceWith(guard);
    });
  }).processSync(selector);
  return { quiet, hover, own };
}

/** The soft body's own hover pose (app/jelly-material.css §8): `scale: var(--jelly-hover-plump)` and its kin. */
export function jellyPose(decl: Declaration): boolean {
  return (
    /^(?:scale|translate)$/.test(decl.prop) &&
    /^var\(--jelly-hover-[a-z-]+\)$/.test(decl.value.trim())
  );
}

function expensivePaint(decl: Declaration): boolean {
  return /^(?:box-shadow|text-shadow|filter)$/.test(decl.prop);
}

export function materialHover(): Plugin {
  return {
    postcssPlugin: 'rmh-material-hover',
    OnceExit(root) {
      const rules: Rule[] = [];
      root.walkRules((rule) => {
        rules.push(rule);
      });
      const processed = new Set<Rule>();
      for (const rule of rules) {
        if (processed.has(rule)) continue;
        const state = hoverSelector(rule.selector);
        if (!state.hover) continue;
        const removed: Declaration[] = [];
        const declarations: Declaration[] = [];
        rule.walkRules((child) => {
          processed.add(child);
        });
        rule.walkDecls((decl) => {
          declarations.push(decl);
          const owner = decl.parent;
          const own = owner?.type === 'rule' && hoverSelector(owner.selector).own;
          if (
            expensivePaint(decl) ||
            (own && /^(?:transform|translate|rotate|scale)$/.test(decl.prop) && !jellyPose(decl))
          )
            removed.push(decl);
        });
        if (!removed.length) continue;
        const stable = rule.cloneBefore({ selector: state.quiet });
        // Keep only the declarations being removed in the non-hover copy.
        const kept = new Set(removed);
        let index = 0;
        stable.walkDecls((decl) => {
          if (!kept.has(declarations[index++])) decl.remove();
        });
        stable.walkRules((child) => {
          child.selector = hoverSelector(child.selector).quiet;
        });
        for (const decl of removed) decl.remove();
      }
    },
  };
}

/** Compile-time hover policy for both site and app CSS, including Tailwind's nested variants.
 * Material lighting owns hover feedback. Preserve focus, pressed and selected colours, and
 * content-reveal behavior; discard hover colour swaps and movement of the hovered control.
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

function colour(decl: Declaration): boolean {
  return (
    /^(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|fill|stroke|box-shadow|text-shadow|text-decoration-color|-webkit-text-fill-color|filter)$/.test(
      decl.prop,
    ) ||
    (decl.prop.startsWith('--') && /(?:color|tint|shadow|glow|(?:^|-)bg(?:-|$))/.test(decl.prop))
  );
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
          if (colour(decl) || (own && /^(?:transform|translate|rotate|scale)$/.test(decl.prop)))
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

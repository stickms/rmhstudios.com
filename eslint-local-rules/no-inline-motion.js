/**
 * `local/no-inline-motion` — site-tier motion comes from `lib/motion.ts`
 * (redesign audit E7).
 *
 * A component never writes its own ease or duration. A JSX `transition` prop
 * whose value is an inline object with literal numbers
 * (`transition={{ duration: 0.2, ease: [0.3, 0, 0.15, 1] }}`), and an
 * `animate` / `initial` / `exit` / `while*` object carrying such a `transition`
 * key, are a second motion vocabulary: every one drifts from the shared curve.
 *
 * Allowed: identifiers and member expressions (`transition={transition}`,
 * `transition={SPRING.soft}`), calls, and objects with no literal numbers
 * (e.g. `{ ...transition, delay: stagger }` where the delay is a variable).
 * Name a token; if none fits, add one to `lib/motion.ts`.
 *
 * Scope: the site tier (components/** and app/routes/** minus the full-screen
 * game/app dirs in `design-scope.js`), wired in `eslint.config.mjs`. A
 * legitimate one-off takes an inline
 * `eslint-disable-next-line local/no-inline-motion -- <reason>`.
 */

const STATE_PROPS = /^(animate|initial|exit|whileHover|whileTap|whileFocus|whileInView|whileDrag)$/;

/** True when the node tree holds a numeric literal (including a negated one). */
function hasLiteralNumber(node) {
  if (!node || typeof node !== 'object') return false;
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'number';
    case 'UnaryExpression':
      return hasLiteralNumber(node.argument);
    case 'ArrayExpression':
      return node.elements.some(hasLiteralNumber);
    case 'ObjectExpression':
      return node.properties.some((p) => p.type === 'Property' && hasLiteralNumber(p.value));
    default:
      return false;
  }
}

function keyName(prop) {
  if (prop.type !== 'Property') return null;
  if (prop.key.type === 'Identifier') return prop.key.name;
  if (prop.key.type === 'Literal') return String(prop.key.value);
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Use lib/motion.ts tokens instead of inline transition objects (E7)' },
    schema: [],
    messages: {
      inline:
        'Inline motion numbers. Use a token from `@/lib/motion` (transition / exitTransition / SPRING / APPLE_SPRING / DURATION / EASE) or add a named one there.',
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : null;
        const expr = node.value?.type === 'JSXExpressionContainer' ? node.value.expression : null;
        if (!name || !expr || expr.type !== 'ObjectExpression') return;
        if (name === 'transition') {
          if (hasLiteralNumber(expr)) context.report({ node, messageId: 'inline' });
          return;
        }
        if (!STATE_PROPS.test(name)) return;
        for (const prop of expr.properties) {
          if (keyName(prop) === 'transition' && hasLiteralNumber(prop.value)) {
            context.report({ node: prop, messageId: 'inline' });
          }
        }
      },
    };
  },
};

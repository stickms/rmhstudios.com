/**
 * `local/no-core-primitive-redefinition` — one copy of the numeric / RNG primitives (redesign audit A4).
 *
 * `clamp`, `clamp01`, `lerp`, `mulberry32` and `shuffle` live in `lib/core/` (math.ts, rng.ts). A module-level
 * re-definition is the drift this prevents: ~100 copies had accumulated, some subtly different (NaN handling,
 * in-place vs copying shuffle). A helper that genuinely differs (extra arguments, a fallback, rounding) says so with
 *   // eslint-disable-next-line local/no-core-primitive-redefinition -- <why it differs>
 * and should ideally get a different name. Tests and lib/core itself are exempt (scoped in scripts/gen-oxlintrc.mjs).
 *
 * This replaces the `no-restricted-syntax` selectors the ESLint config carried (oxlint has no AST-selector rule):
 * `Program > FunctionDeclaration[id.name=/^(clamp|…)$/]`, the `Program > VariableDeclaration > VariableDeclarator`
 * form, and both under `Program > ExportNamedDeclaration`.
 */

const NAMES = new Set(['clamp', 'clamp01', 'lerp', 'mulberry32', 'shuffle']);

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow re-defining clamp/clamp01/lerp/mulberry32/shuffle at module level; import them from @/lib/core',
    },
    schema: [],
    messages: {
      redefined: 'Import this from `@/lib/core/math` / `@/lib/core/rng` instead of redefining it (redesign audit A4).',
    },
  },
  create(context) {
    /** @param {any} declaration */
    function check(declaration) {
      if (!declaration) return;
      if (declaration.type === 'FunctionDeclaration') {
        if (declaration.id && NAMES.has(declaration.id.name)) context.report({ node: declaration.id, messageId: 'redefined' });
      } else if (declaration.type === 'VariableDeclaration') {
        for (const declarator of declaration.declarations) {
          if (declarator.id && declarator.id.type === 'Identifier' && NAMES.has(declarator.id.name)) {
            context.report({ node: declarator.id, messageId: 'redefined' });
          }
        }
      }
    }
    return {
      Program(program) {
        for (const statement of program.body) {
          if (statement.type === 'ExportNamedDeclaration') check(statement.declaration);
          else check(statement);
        }
      },
    };
  },
};

export default rule;

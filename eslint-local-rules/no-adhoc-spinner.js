/**
 * `local/no-adhoc-spinner` — site-tier code waits with `<Spinner>`, not a
 * hand-rolled `animate-spin`.
 *
 * ## What this is protecting
 *
 * `components/ui/spinner.tsx` renders the site's radial loading mark so every
 * wait speaks the same language as the hub. A `<Loader2 className="animate-spin">`
 * or a bordered `<div className="animate-spin rounded-full border-2 …">` is a
 * second loading vocabulary: a different shape, a different colour decision and
 * a different accessible name on every page that wrote its own (E6 in
 * `docs/plans/2026-11-09-ground-up-redesign-audit.md`).
 *
 * ## What it flags
 *
 * Any string, template string or class-helper argument containing the
 * `animate-spin` class in a **site-tier** file: `components/**` outside
 * `components/ui/**` and the full-screen tier dirs, and `app/routes/**` outside
 * the full-screen route segments. The full-screen games and `--app-*` apps own
 * their loading art; the exemption lists are the shared ones in
 * `eslint-local-rules/design-scope.js`.
 *
 * ## The legitimate exceptions
 *
 * A busy icon swapped in *inside a button* (`{busy ? <Loader2 … animate-spin/> : <Icon/>}`)
 * cannot take `<Spinner>`: it renders a `role="status"` mark, which would add
 * "Loading" to the button's accessible name. Those files carry a file-level
 * `eslint-disable local/no-adhoc-spinner -- <reason>`; a standalone wait is
 * always a `<Spinner>`.
 */

import { isSiteTier as isSiteTierPath } from './design-scope.js';

const SPIN = /(^|[\s"'`])animate-spin($|[\s"'`])/;

/** The one exemption list (design-scope.js), plus the primitive itself. */
function isSiteTier(filename) {
  const path = filename.replace(/\\/g, '/');
  const at = path.search(/(?:^|\/)(?:components|app\/routes)\//);
  if (at < 0) return false;
  const rel = path.slice(path[at] === '/' ? at + 1 : at);
  if (rel.startsWith('components/ui/')) return false;
  return isSiteTierPath(rel);
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Use components/ui/spinner instead of a hand-rolled animate-spin in site-tier code',
    },
    schema: [],
    messages: {
      adhoc:
        'Hand-rolled `animate-spin`. Use `<Spinner>` from "@/components/ui/spinner" for a standalone wait; ' +
        'an in-button busy icon needs a file-level disable with a reason (see eslint-local-rules/no-adhoc-spinner.js).',
    },
  },
  create(context) {
    if (!isSiteTier(context.filename ?? context.getFilename())) return {};
    return {
      Literal(node) {
        if (typeof node.value === 'string' && SPIN.test(node.value)) {
          context.report({ node, messageId: 'adhoc' });
        }
      },
      TemplateElement(node) {
        if (SPIN.test(node.value.raw)) context.report({ node, messageId: 'adhoc' });
      },
    };
  },
};

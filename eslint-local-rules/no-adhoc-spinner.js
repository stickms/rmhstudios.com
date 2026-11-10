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
 * their loading art; the lists below mirror `FULLSCREEN_TIER_DIRS` /
 * `FULLSCREEN_ROUTE_SEGMENTS` in `lib/__tests__/design-consistency.test.ts`.
 *
 * ## The legitimate exceptions
 *
 * A busy icon swapped in *inside a button* (`{busy ? <Loader2 … animate-spin/> : <Icon/>}`)
 * cannot take `<Spinner>`: it renders a `role="status"` mark, which would add
 * "Loading" to the button's accessible name. Those files carry a file-level
 * `eslint-disable local/no-adhoc-spinner -- <reason>`; a standalone wait is
 * always a `<Spinner>`.
 */

/** Mirrors FULLSCREEN_TIER_DIRS in lib/__tests__/design-consistency.test.ts. */
const FULLSCREEN_TIER_DIRS = new Set([
  'altair',
  'cursed-logic',
  'daily-puzzles',
  'dream-rift',
  'gabriels-horn',
  'game',
  'hearthworks',
  'house-always-wins',
  'kowloon-knockout',
  'laundry-sort',
  'lights-out',
  'neon-driftway',
  'nightrail',
  'signal-forge',
  'slice-it',
  'synapse-storm',
  'temple-of-joy',
  'vega',
  'velum2099',
  'versecraft',
  'void-breaker',
  'rmhbox',
  'rmhcode',
  'rmhmusic',
  'rmhstudy',
  'rmhtube',
  'rmhtype',
  'tf2-hud',
  'tf2-game',
  'sp-game',
  'csgo-game',
  'rmhvibe',
  'shared',
  'studio',
  'blm',
  'pf2ecal',
  'dunesday',
  'breakpoint',
  'covid',
  'elections',
  'doctrine',
  'history',
  'lockdown',
  'render',
  'rmh-capital',
  'rmh-pmc',
  'sohumbum',
  'sohumtracker',
  'steam',
  // The primitive itself.
  'ui',
]);

/** Mirrors FULLSCREEN_ROUTE_SEGMENTS in lib/__tests__/design-consistency.test.ts. */
const FULLSCREEN_ROUTE_SEGMENTS = new Set([
  'altair',
  'api',
  'daily',
  'discord',
  'dream-rift',
  'games',
  'dunesday',
  'gabriels-horn',
  'hearthworks',
  'house-always-wins',
  'kowloon-knockout',
  'laundry-sort',
  'neon-driftway',
  'nightrail',
  'pf2ecal',
  'rmhbox',
  'rmhcode',
  'rmhmusic',
  'rmhstudy',
  'rmhtube',
  'rmhtype',
  'tf2-hud',
  'secret',
  'slice-it',
  'sohumbum',
  'sohumtracker',
  'strategies',
  'studio',
  'synapse-storm',
  'temple-of-joy',
  'velum2099',
  'versecraft',
  'void-breaker',
]);

const SPIN = /(^|[\s"'`])animate-spin($|[\s"'`])/;

function isSiteTier(filename) {
  const path = filename.replace(/\\/g, '/');
  let m = path.match(/(?:^|\/)components\/([^/]+)\//);
  if (m) return !FULLSCREEN_TIER_DIRS.has(m[1]);
  m = path.match(/(?:^|\/)app\/routes\/([^/]+?)(?:\.tsx?)?(?:\/|$)/);
  if (m) return !FULLSCREEN_ROUTE_SEGMENTS.has(m[1]);
  return false;
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

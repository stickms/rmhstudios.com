/**
 * Repo-local ESLint plugin.
 *
 * Rules that encode a convention this codebase actually depends on and that no
 * published plugin can know about. Registered as the `local/` plugin namespace
 * in `eslint.config.mjs`.
 */

import noAdhocUserSelect from './no-adhoc-user-select.js';
import noLucideNamespaceImport from './no-lucide-namespace-import.js';
import noUseClientDirective from './no-use-client-directive.js';
import noRawPaletteColor from './no-raw-palette-color.js';
import noHardcodedRadius from './no-hardcoded-radius.js';
import noTransitionAll from './no-transition-all.js';
import noDeadAnimateClasses from './no-dead-animate-classes.js';

/** @type {import('eslint').ESLint.Plugin} */
const plugin = {
  meta: { name: 'eslint-plugin-local', version: '1.0.0' },
  rules: {
    'no-adhoc-user-select': noAdhocUserSelect,
    'no-lucide-namespace-import': noLucideNamespaceImport,
    'no-use-client-directive': noUseClientDirective,
    'no-raw-palette-color': noRawPaletteColor,
    'no-hardcoded-radius': noHardcodedRadius,
    'no-transition-all': noTransitionAll,
    'no-dead-animate-classes': noDeadAnimateClasses,
  },
};

export default plugin;

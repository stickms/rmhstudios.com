# Discord SDK validator backport

`@discord/embedded-app-sdk@2.5.0` ships its own Zod 3 runtime in both
`output/lib/zod/lib/index.mjs` and `index.cjs`. Changing a dependency resolution
does not replace that embedded code.

The patch rejects oversized `.max()` / `.length()` arrays and `.max()` / `.size()`
sets before iterating their elements. This backports the upper-size rejection
behavior of [Zod's security fix](https://github.com/colinhacks/zod/commit/a0ebf970f2d752e5f58527cd2942ff48be4f46bd)
for [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
Zod 3 maps do not have size bounds. Valid inputs, lower bounds, custom messages,
paths, synchronous parsing and asynchronous parsing retain their existing APIs.

The SDK's external `zod` dependency is used by its declarations; its published
JavaScript imports the embedded runtime. The scoped override resolves that
declaration dependency to Zod 4.6.7, and the patch explicitly imports `zod/v3`
in declarations to preserve the original type contract. The SDK's JavaScript
continues to use its patched embedded validator. The override alone would not
fix the runtime vulnerability. No advisory is ignored and the production audit
threshold is unchanged.

`lib/__tests__/discord-sdk-security.test.ts` exercises the installed ESM and
CommonJS runtimes, early rejection without element visits, valid payloads and
the SDK's response parser. Docker copies the patches before dependency
installation, and the node_modules cache key includes patch contents. Git keeps
patch files in LF form so their lockfile hashes survive Windows checkouts.

The SDK is pinned while the patch is needed. On an upstream SDK update, inspect
both runtime formats and remove this patch and the scoped override only after
the runtime regression tests and `pnpm audit --prod --audit-level=high` pass.
Regenerate changes using `pnpm patch` / `pnpm patch-commit`; do not edit installed
node_modules in place or replace the SDK's v3 runtime with the v4 API.

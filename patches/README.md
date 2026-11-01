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

# drei Html: deferred root unmount

`@react-three/drei@10.7.9` `Html` mounts its DOM content in its own `ReactDOM.createRoot` and
unmounted it synchronously in a layout-effect cleanup. R3F runs that cleanup inside react-dom's
commit whenever a `Canvas` (or the Html's parent) unmounts, so React logged "Attempted to
synchronously unmount a root while React was already rendering" (seen on RMH Farming Sim and
Kowloon Knockout). The patch defers the unmount to a microtask and lets a re-run of the effect
(StrictMode) adopt the pending root instead of calling `createRoot` on the same container twice.
Drop the patch once upstream does the same.

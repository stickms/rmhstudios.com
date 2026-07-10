// Nitro startup module — installs the `reflect-metadata` global polyfill at
// server-process start, BEFORE any request lazily evaluates the auth chunk.
//
// Why this shape:
//   * `@better-auth/passkey` bundles `tsyringe` (via `@simplewebauthn`), whose
//     decorators call `Reflect.getMetadata(...)` at module-evaluation time. In
//     the production Nitro/Rolldown bundle the passkey chunk is imported before
//     any of `lib/auth.ts`'s own statements run, so a source-level
//     `import "reflect-metadata"` there is both reordered after passkey and
//     tree-shaken.
//   * A bare `import "reflect-metadata"` here is ALSO tree-shaken by Rolldown
//     (side-effect-only imports of a package with no `sideEffects` field are
//     dropped, even when externalized).
//   * Nitro applies plugins SYNCHRONOUSLY and does not await them, so an async
//     `await import("reflect-metadata")` would race the first request.
//
// A synchronous runtime `require()` sidesteps all three: it can't be
// tree-shaken (it's a call, not a static import), it runs the polyfill IIFE
// synchronously at module load (process start), and it resolves against the
// copy traceDeps places in `.output/server/node_modules` (see vite.config.ts).
import { createRequire } from "node:module";

createRequire(import.meta.url)("reflect-metadata");

export default function reflectMetadataPlugin() {
  if (typeof (Reflect as unknown as { getMetadata?: unknown }).getMetadata !== "function") {
    throw new Error("[startup] reflect-metadata polyfill failed to load");
  }
}

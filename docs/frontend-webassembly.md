# Frontend WebAssembly

The liquid globe uses two small AssemblyScript modules: `wasm/dough.ts` for
the dough grid's numerical substep/height field, and `wasm/projection.ts` for
Peirce projection lookup textures. Rendering stays in WebGL. Other projections
keep their inexpensive JavaScript implementation.

`pnpm wasm:build` compiles both with the pinned npm dependency. Vite also runs
this compiler before dev and production builds, including Docker's direct
`pnpm exec vite build`. `pnpm test` compiles before running the tests. No native
SDK, runtime compiler, host architecture flag, database change, or environment
variable is required. The compiler stays in build dependencies; the runtime
image ships only the emitted assets and application code.

Vite emits content-hashed `.wasm` files alongside the JS chunks. Nitro serves
them as `application/wasm` under the existing immutable `/assets/**` policy.
The Docker build and frontend CI reject output missing either valid module.
These files must stay with their matching JS release during deployment and
rollback. They are not external CDN objects or mutable `/public/*.wasm` URLs.

## Apache policy: one-time host configuration

The browser needs `'wasm-unsafe-eval'` in `script-src`; it does not need the
broader `'unsafe-eval'`, cross-origin isolation, or SharedArrayBuffer.
`deploy/apache/rmhstudios.conf` includes the Wasm permission. Sync the
canonical vhost to the existing production vhost and validate/reload Apache:

```bash
sudo install -m 644 deploy/apache/rmhstudios.conf /etc/apache2/sites-available/rmhstudios.conf
sudo apachectl configtest && sudo systemctl reload apache2
```

The sandboxed deployment webhook cannot modify `/etc` or run sudo. Consequently
the host policy update needs an operator once; rebuilding the app container
does not update the installed vhost. `deploy.sh` warns when the live origin CSP
still lacks the permission. Verify the live document's enforced CSP
contains `'wasm-unsafe-eval'` after any edge/CDN response-header rules. Until
that policy lands, the globe continues on JavaScript.

## Runtime and verification

Dough loads after the globe mounts, migrates the current state without dropping
a gesture, and then shares fixed linear memory with JS and the texture uploader.
There is no state copy or memory growth per frame. Each body has isolated memory.
Peirce warms in the eversion renderer's realm (worker when supported) and copies
each finished LUT into an owned result so later bakes cannot overwrite a run.
An early navigation uses JS while compilation is pending. Unsupported Wasm,
blocked compilation, offline/network failures, and incorrect MIME types preserve
the existing JavaScript behavior. Loading has a five-second network timeout.

```bash
pnpm wasm:build
pnpm test lib/wasm/__tests__ lib/__tests__/dough.test.ts lib/eversion/__tests__/projection-lut.test.ts
pnpm wasm:bench
pnpm build:frontend
node scripts/check-wasm-output.mjs
```

The tests run the actual compiled modules, compare simulation trajectories and
LUTs with JS, check volume conservation and settling, migrate a live drag, and
exercise loading failures. The benchmark includes the JS simulation lifecycle
and LUT output copy; it measures warm CPU work, not loading or page-level speed.
Browser/device performance still needs a browser profile, especially on mobile.

## Validation on 2026-10-22

Local warm CPU medians on Windows x64 / Node 24.13 (not page-load or FPS claims):

| Work                                        | JavaScript | WebAssembly | Speedup |
| ------------------------------------------- | ---------: | ----------: | ------: |
| Dough frame                                 |  0.2364 ms |   0.1199 ms |   1.97× |
| Peirce 1024×512 bake, including output copy | 46.8403 ms |  24.4156 ms |   1.92× |

The production Vite/Nitro build, emitted-binary check, immutable caching/MIME
check against the running built server, bundle budget, entry composition,
frozen-lockfile check, and consistency gate passed. Edge/Chromium ran the
production dough wrapper and a projection worker under the canonical Apache
CSP; removing the Wasm permission exercised the fallback successfully. The
focused run passed 982 tests across 32 suites. Full lint passed with no errors
and its existing warning backlog. The Wasm implementation lints cleanly.

Typechecking passes after adding explicit module types to eight existing
synchronous `require()` calls in RMHBox/Vega; these annotations preserve runtime
behavior and remove the pre-existing `unknown` errors that blocked the commit
gate. The font generator also uses platform-safe file URLs, CSS path separators,
and newline comparison so the package-change gate works on Windows. The full
test run passed 9,918 tests and failed 128, primarily in Windows/POSIX
path, process, and sandbox-dependent checks. These are not a clean full-suite
result and must be resolved/verified in the normal Linux CI environment before
release. No production deploy or host policy reload was performed here.

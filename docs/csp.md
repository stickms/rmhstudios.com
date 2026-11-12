# Content-Security-Policy: nonce rollout (redesign audit F5)

The enforced policy in `deploy/apache/rmhstudios.conf` carries `script-src
'unsafe-inline'`, so a single injected `<script>` runs. This page is the plan for
replacing it with a nonce + hash policy, built by `lib/csp/policy.server.ts`.

## What the framework supports

TanStack Start supports a per-request CSP nonce: `router.options.ssr.nonce`
(`@tanstack/router-core` `RouterOptions.ssr`, `router.d.ts:371`). The router puts it on
every tag it renders: head scripts/styles/links (`react-router/.../headContentUtils.js`),
`<Scripts />` (`Scripts.js:17`), `ScriptOnce` (`ScriptOnce.js:12`) and the streamed
dehydration scripts (`ssr/renderRouterToStream.js:21,58`), and it emits
`<meta property="csp-nonce">` so the client can read it back. So the dynamic
`$tsr` / `data-tsr-stream-part` scripts need no hash and no `'unsafe-inline'`.

## How it is wired

1. `server/nitro/security-headers.ts` mints a 128-bit nonce in Nitro's `request` hook
   (`lib/csp/nonce.server.ts`, `AsyncLocalStorage.enterWith`, the same mechanism as
   `otel.ts`).
2. `getRouter()` (`app/router.tsx`) reads it and passes `ssr: { nonce }`; in the browser
   it reads the `csp-nonce` meta instead.
3. `__root.tsx` puts `nonce` on its one hand-written inline script (the pre-paint body
   script). The pre-paint head script goes through `head().scripts`, so the router
   nonces it.
4. The `response` hook sends `Content-Security-Policy-Report-Only` for HTML responses
   with that nonce, plus `Reporting-Endpoints: csp="/api/csp-report"`.

Resulting `script-src`:

```
'self' 'nonce-<request>' 'strict-dynamic' 'sha256-<PREPAINT_SHA256>'
'sha256-<PREPAINT_BODY_SHA256>' 'wasm-unsafe-eval' <AdSense hosts>
```

- The two sha256 values are the generated pre-paint scripts (`lib/prepaint/generated.ts`),
  byte-identical per request; a test keeps them in the policy.
- `'strict-dynamic'` lets nonce-trusted scripts load chunks, the ads loader and game
  runtimes (`document.createElement('script')`). Browsers that support it ignore
  `'self'` and the host list; older ones fall back to them.
- No `'unsafe-eval'`. No `'unsafe-inline'`: the framework can nonce everything, so the
  CSP2 fallback trick (browsers ignore `'unsafe-inline'` once a nonce or hash is present)
  is not needed. If a future inline script cannot be nonced, add it to the hash list, not
  `'unsafe-inline'`.
- `application/ld+json` and the `application/json` pre-paint data block are not
  executed, so `script-src` does not govern them. JSON-LD needs no nonce.
- `style-src` keeps `'unsafe-inline'` (inline `style=""` attributes are pervasive).
  Out of scope here.
- All other directives are byte-identical to the Apache policy (a test asserts it), so
  switching blocks nothing new.

## Known limitation: edge-cached anonymous HTML

`server/nitro/anon-html-cache.ts` marks anonymous HTML `s-maxage` for Cloudflare. If a
Cloudflare Cache Rule stores it, the body AND its CSP header are cached together, so
every visitor in that window shares one nonce. The policy still works, but a nonce an
attacker can read from a cached page no longer protects those pages. The Cache Rule is
no longer scoped to `/`: it covers the eleven index pages and the `/blog/` and `/news/`
articles, cached for up to 150 s and a day respectively.

The safe default is now in code. `carriesEnforcedNonce` in the cache plugin refuses to
mark a response `public` when its **enforced** `Content-Security-Policy` names a nonce,
so the day enforcement moves to Nitro (day 14 below) anonymous HTML stops being shared
instead of sharing a nonce. Nothing changes while the nonce policy is Report-Only.

To get the edge cache back after the cutover, cacheable documents need a policy with no
nonce: hashes for the static pre-paint scripts (already computed) and loader data moved
out of executable inline scripts (third-pass audit, RT3). Until then the cutover trades
the anonymous edge cache for an enforced policy; say so in the cutover PR.

## Two-week rollout

The report endpoint is `POST /api/csp-report` (`lib/api/routes/csp-report.server.ts`): accepts
`report-uri` and Reporting API payloads, rate limited to 60/min/IP, strictly validated,
fields truncated, logged as `[csp-report]` and not stored.

| Day   | Step                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Deploy. Both headers are now sent: Apache's enforced policy (unchanged) and Nitro's report-only one. Confirm one HTML response carries `Content-Security-Policy-Report-Only` with a `nonce-` and that the page's inline scripts carry the same nonce.                                                                                                                                                                                                                                                                       |
| 0-3   | Watch `[csp-report]` lines (`docker compose logs web \| grep csp-report`). Expected noise: browser extensions (`blocked-uri` of `chrome-extension` / `moz-extension` / `inline` with no `source-file`). Anything with `violated-directive: script-src*` from our own pages is a bug: fix by nonce or hash.                                                                                                                                                                                                                  |
| 3-10  | Keep watching. Must see zero first-party `script-src` reports across a full week, including a Discord Activity session, an ad-bearing page, the games that load WASM, and a signed-in session.                                                                                                                                                                                                                                                                                                                              |
| 10-12 | Verify the Cloudflare caching decision above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 14    | In `deploy/apache/rmhstudios.conf`, remove the `Content-Security-Policy` line. Nitro then needs to send the same policy as enforced: change `security-headers.ts` to emit `Content-Security-Policy` (instead of `-Report-Only`) with `buildCspPolicy`; keep the `frame-ancestors`-only header out of the way (a second CSP header is intersected, which is harmless but redundant). Hand-install the vhost on the VPS (deploys never touch `/etc/apache2`). Keep Report-Only off, or keep reporting on the enforced header. |
| 14+   | Watch reports for another week; rollback is reinstating the old Apache line.                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Request body limits (documented, not changed)

`LimitRequestBody 1610612736` (1.5 GB) is a global backstop sized for the largest admin
upload (1 GB videos at `/api/admin/albums/:id/slides`). Everything else is JSON that
needs kilobytes, and `defineHandler` buffers the whole body as text before validating.
Proposal for a follow-up that edits the vhost:

```apache
LimitRequestBody 1048576                       # 1 MB default
<Location "/api/csp-report">   LimitRequestBody 16384      </Location>
<Location "/api/client-error"> LimitRequestBody 16384      </Location>
<LocationMatch "^/api/(media|upload|uploads)/">  LimitRequestBody 104857600  </LocationMatch>
<LocationMatch "^/api/admin/albums/[^/]+/slides"> LimitRequestBody 1610612736 </LocationMatch>
```

Enumerate the real upload routes (`grep -rn formData app/routes/api`) before changing it.

## Out of scope

Session revocation (F5 step 2).

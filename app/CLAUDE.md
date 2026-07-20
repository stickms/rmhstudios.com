# app/ — TanStack Start routes

> Scope: this file guides work inside `app/` (routes, router, global CSS).
> Repo-wide context: [`/CLAUDE.md`](../CLAUDE.md). Page look-and-feel:
> [`docs/design-language.md`](../docs/design-language.md) and
> [`docs/page-consistency.md`](../docs/page-consistency.md).

This is a **TanStack Start** app (file-based routing) on Vite 8 + React 19 +
Nitro SSR. It is **not Next.js** — ignore any Next.js idioms you know.

## Contents

```
app/
  routes/            all page + API routes (~205 .tsx pages, ~340 .ts API files)
    __root.tsx       root document (see below)
    _site.tsx        pathless layout: sidebar/nav shell for standard pages
    _site/           standard site pages (feed, profiles, wallet, admin, …)
    api/             server routes (~415 files)
    <game>.tsx       full-screen games/apps (top level, no shell)
    sitemap[.]xml.ts /sitemap.xml ([.]= escaped literal dot)
  globals.css        theme tokens: base + curated themes as .style-* classes (see design-language.md)
  router.tsx         router config: intent preloading, pending component timings
  routeTree.gen.ts   GENERATED (~487 KB) — never edit by hand
  icon.svg
```

There is **no `app/lib/`** — shared code is at repo root `lib/`, imported as
`@/lib/...` (aliases: `@/lib`, `@/components`, `@/hooks`, `@/app`).

## File-naming rules (get these exactly right)

| Pattern | Meaning | Example |
|---|---|---|
| `foo.tsx` | `/foo` | `wallet.tsx` |
| `foo.$bar.tsx` | dot = path separator, `$bar` = param | `blog.$slug.tsx` → `/blog/$slug` |
| `$.ts` | catch-all splat | `api/auth/$.ts` |
| leading `_` | pathless layout (no URL segment) | `_site.tsx`, `_site/…` |
| `index.tsx` | directory index route | `_site/index.tsx` = `/` (the feed) |
| `route.tsx` | layout route for a directory (renders `<Outlet/>`, holds `beforeLoad` gates) | `_site/admin/route.tsx` |
| trailing `_` | opt out of parent layout nesting | `builds_.$slug.tsx` → `/builds/$slug`, not nested under a builds layout |
| `[.]` | escaped literal character | `sitemap[.]xml.ts` |

**Placement decides chrome:** files under `_site/` get the sidebar shell;
top-level files render full-screen. Games, `/login`, `secret/*`, `discord/*`,
and the legal pages are intentionally top-level — don't move them.

After adding/renaming a route file, run the dev server or a build once —
the TanStack Router Vite plugin regenerates `routeTree.gen.ts`. There is no
standalone CLI for it.

## Adding a page route

```tsx
export const Route = createFileRoute("/_site/example")({
  head: () => ({ meta: [{ title: "Example | RMH Studios" }] }),
  loader: ({ params }) => getExample({ data: params.id }), // optional
  component: ExamplePage,
});
```

- **head/SEO:** static/marketing pages use `buildMeta({title, description,
  path, image})` + `buildCanonical(path)` from `@/lib/seo` (see
  `rmh-capital/*`, `adaptive-intelligence.tsx`). Dynamic pages build meta
  arrays from `loaderData` (see `blog.$slug.tsx`). JSON-LD goes in
  `head().scripts` via `jsonLdScript(articleSchema({...}))` from
  `@/lib/schema` — never hand-serialize a JSON-LD `<script>`
  (`jsonLdScript` escapes `<`). Site-wide Organization/WebSite JSON-LD is
  already emitted from `__root.tsx`.
- **Loaders:** call a `createServerFn({ method: "GET" })
  .validator(...).handler(...)` from `@tanstack/react-start`; read with
  `Route.useLoaderData()` / `Route.useParams()`.
- **404:** `throw notFound()` in the loader (renders
  `components/errors/NotFound`). **Auth gate:** `throw redirect({ to:
  "/login", search: { callbackURL } })` in `beforeLoad`/loader.
- **Errors:** `errorComponent`/`notFoundComponent` are set on `__root` and
  `_site` — leaf pages usually inherit; only override for special shells.

## Adding an API route

API routes are `.ts` files with `server.handlers` keyed by HTTP method
(GET/POST/PUT/PATCH/DELETE/OPTIONS). The canonical shape (auth → rate limit →
validate → act), modeled on `api/ai/transform.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const schema = z.object({ text: z.string().min(1).max(1000) });

export const Route = createFileRoute("/api/example")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 20, windowMs: 60_000, prefix: "example",
          });
          if (!allowed) return Response.json({ error: "Too many requests" }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });

          // ... use parsed.data and session.user.id
          return Response.json({ ok: true });
        } catch (error) {
          console.error("example error:", error);
          return Response.json({ error: "Internal server error" }, { status: 500 });
        }
      },
    },
  },
});
```

Conventions:

- **Responses:** `Response.json(data)` on success; `Response.json({ error },
  { status })` on failure. Statuses in use: 400 invalid input, 401
  unauthorized, 403, 404, 429 rate-limited, 500, 502/503 upstream. Non-JSON
  (images/XML) uses `new Response(body, { headers })` with explicit
  `Content-Type`/`Cache-Control`.
- **Admin gating:** `if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) …`
  (the `isAdmin` field is a Better Auth custom user field).
- **Rate limiter caveat:** `lib/rate-limit.ts` is in-memory and per-process,
  and every limit is multiplied by `RATE_LIMIT_MULTIPLIER` (default 4). It
  neither survives restarts nor spans instances.
- **User-supplied URLs:** fetch through `safeFetch` from
  `@/lib/ssrf-guard.server` (see `api/oembed.ts`), never bare `fetch`.
- **Server-to-server:** internal endpoints authorize via
  `authorizeInternalRequest` (`@/lib/internal-auth`).
- **Auth endpoint:** `/api/auth/$` is a single splat delegating everything to
  Better Auth — don't add sibling auth routes.

## __root.tsx / _site.tsx (don't duplicate what they already do)

`__root.tsx`: resolves session + locale server-side (signed-in shell on first
paint), injects the anti-FOUC inline theme/locale scripts, deferred font
loading, site-wide JSON-LD, error/404 boundaries, client-error reporting
(`lib/client-errors.ts` → `/api/client-error`), Core Web Vitals RUM
(`lib/rum.ts` → `/api/rum`), and service-worker registration. It special-cases
`/discord/*` routes with a **minimal head** (Discord's CSP blocks inline
scripts/external fonts) — replicate that if adding Discord Activity routes.

`_site.tsx`: left sidebar, mobile nav, skip link, `<main id="main-content">`
landmark, `.page-root` enter animation, and its own error/404 components so
failures keep the shell.

`router.tsx`: `defaultPreload: "intent"` (50ms delay, 30s preload stale
time), `scrollRestoration`, `RoutePending` as the default pending component
(150ms delay / 300ms min display).

## Gotchas

1. **Never edit `routeTree.gen.ts`** — regenerate via dev/build.
2. `robots.txt` / `manifest.webmanifest` are static files in `public/`, not routes.
3. API routes are `.ts` + `server.handlers`; pages are `.tsx` + `component`.
   Don't mix.
4. Server-only modules use the `*.server.ts` suffix and live in `lib/` — a
   Vite plugin stubs them out of the client bundle. Never import one from
   client component code (see `lib/CLAUDE.md`).
5. `globals.css` is the single theme source — new UI must use the `--site-*`
   token utilities, not hardcoded colors (see `docs/design-language.md`).

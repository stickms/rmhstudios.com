# Runtime Architecture & Deploy Pipeline

> What actually runs where, and how code gets to production. Companion to
> [`codebase-overview.md`](./codebase-overview.md) (code layout) and the
> per-directory `CLAUDE.md` guides. Sources of truth: `docker-compose.yml`,
> `deploy.sh`, `deploy/`, `.github/workflows/` — when any doc (including this
> one) disagrees with those files, the files win.

## 1. The big picture

```
                     Cloudflare (TLS)
                          │
                       Apache (VPS)          ← security headers, vhosts
   ┌──────────┬───────────┼─────────────┬──────────────┐
   │ /        │ /socket/  │ /rmhbox-ws/ │ /rmhtube-ws/ │
   ▼          ▼           ▼             ▼              │
 web:7005   socket:7001  rmhbox:7676  rmhtube:7003     │   ← Node containers
 (Nitro SSR) (Socket.IO) (Socket.IO)  (Socket.IO)      │
   │                                                   │
   │  ladder-worker · homes-worker · jobs              │
   │     (Node crons + pg-boss backbone, no port)      │
   │                                                   │
   │  supervisor:9090 (Go: discord-bot + recap +       │
   │     doctrine-worker + vibe-worker + bot-worker +  │
   │     streak-saver)                                 │
   │  status:7008 (Go)   assets:7007 (Go)              │
   │  redis / redis-state · minio:9000/9001 (infra)    │
   ▼                                                   ▼
 PostgreSQL                                     R2/S3 (media)
```

**Production is a hybrid runtime.** Node is authoritative for the web SSR and
every user-facing realtime hub; Go is authoritative for the background-worker
tier, the status dashboard, and asset streaming. All container ports bind to
`127.0.0.1`; Apache is the only front door. rmhmusic runs _inside_ the Node
socket-server (port 7001), not as its own service.

The former **full-Go topology** — a `gateway` fronting Go hubs
(gamehub/rmhbox/rmhtube/rmhmusic) with a Redis backplane, plus its Helm chart
and k8s manifests — was **removed in the rewrite** (design §5.2): it never
served a production request and duplicated the Node hubs. Go now runs only what
production uses — the `supervisor` (background workers), `status`, and
`assets`. The Node hubs are the realtime tier. Recover the deleted topology from
git history (tag `pre-rewrite-go-realtime`) if it is ever revived.

## 2. Images: two, from one Dockerfile

The root `Dockerfile` builds both production images; `vite build` runs once:

| Image                   | Target        | Contents                                                                                                                              | Runs                                        |
| ----------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `rmhstudios-app` (slim) | `runner`      | Node app: `.output/` (Nitro) + `dist-server/*.cjs` bundles                                                                            | web, socket, rmhbox, rmhtube, ladder-worker, homes-worker, jobs |
| `rmhstudios-app-full`   | `runner-full` | slim image + Chromium + git + Go binaries in `/app/bin/` (built by the Dockerfile's `go-builder` stage — plain `go build`, not Bazel) | supervisor, status, assets                  |

## 3. Deploy pipeline (push → production)

1. **Trigger:** push to `main` → `.github/workflows/deploy.yml` builds the two
   images on a native ARM64 runner, pushes them to GHCR tagged with the commit
   SHA, then POSTs an HMAC-signed request to the VPS webhook receiver
   (`webhook-server.cjs`), which runs `./deploy.sh production <sha>`. (A newer
   commit to `main` **cancels** the in-progress _build_ and starts fresh
   — `concurrency: cancel-in-progress`, keyed by ref so branch dispatches don't
   interfere. The _deploy_ phase is never cancelled mid-flight: `deploy.sh`'s
   flock+queue lets a running deploy finish and runs the newest queued one next.
   The listener is driven by CI — not a raw push webhook — so the deploy runs
   after the image exists.)
2. **`deploy.sh production <sha>`** (flock-serialized; reports to Discord + GitHub
   commit status):
   - `git fetch` + `reset --hard <sha>` (self-restarts if deploy.sh itself changed)
   - **pull** the two GHCR images for `<sha>` and retag them to the local names
     compose expects (both also tagged with the git SHA for rollback)
   - background: sync static assets + avatars to R2
   - `prisma migrate deploy` in a throwaway container (skips when current)
   - `docker compose up -d --scale web=0` — everything **except** web
   - **blue/green web hotswap** (`deploy/hotswap-web.sh`): start the new web
     container on the spare port (7005 ⇄ 7015), health-gate it, flip Apache's
     active-port include with a graceful reload, stop the old container
   - parallel health checks; prune stale + rollback images
3. **Rollback:** previous SHA-tagged images are kept (one per env); replaced
   Node workers can be revived by restoring their compose command blocks (see
   `docs/runbooks/2026-06-22-go-runtime-cutover.md`).

## 4. CI

~45 workflows live in `.github/workflows/`. The load-bearing gates:

| Workflow                                   | Gates                                                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy.yml`                               | CD — push to `main` → build + push images to GHCR → trigger VPS listener (above)                                                                                                            |
| `web-ci.yml`                               | Frontend gate: `tsc --noEmit` + `pnpm lint` + advisory `vitest run` (check job), `build:frontend` (build job), and a `pnpm audit --prod` (audit job)                                             |
| `typecheck-server.yml`                     | Typechecks the Node service tier against `tsconfig.server.json`                                                                                                                             |
| `vitest-coverage.yml`                      | Test run with coverage                                                                                                                                                                      |
| `go-microservices.yml`                     | Go fleet: `bazelisk test --build_tests_only //go-services/...`, path-filtered to `go-services/**`. (The Postgres-backed e2e + `helm lint` jobs were removed with the Go realtime/Helm topology — design §5.2.) |
| `codeql.yml`                               | CodeQL SAST for JS/TS + Go                                                                                                                                                                  |
| `senior-review.yml`                        | LLM review gate on PRs (Claude Opus over the diff; fails on a FAIL verdict; short-circuits green for non-owner authors)                                                                     |

Plus many granular linters/scanners: `prettier`, `eslint`/`markdownlint`/
`yamllint`/`actionlint`/`shellcheck`/`shfmt`/`hadolint`/`editorconfig-check`,
`prisma-*` (format/validate/migrate-status), `i18n-*` (extract-check/json-valid),
security scanners (`semgrep`, `trivy-fs`, `trufflehog`, `checkov`, `zizmor`,
`go-gosec`/`go-vuln`/`go-licenses`), `license-check-js`, `pnpm-audit-full`,
`compose-validate`, `terraform-fmt`/`terraform-validate`, and `secret-file-guard`.
Dependabot (`.github/dependabot.yml`) covers npm (root), gomod (`go-services/`),
and github-actions weekly. Run at least `pnpm exec tsc --noEmit`, `pnpm lint`,
and `pnpm exec vitest run` locally before pushing.

## 5. Ports reference

| Port      | Service                          | Runtime            | Exposure                    |
| --------- | -------------------------------- | ------------------ | --------------------------- |
| 7005      | web (Nitro SSR) — blue           | Node               | Apache `/`                  |
| 7015      | web — green (hotswap spare)      | Node               | Apache flip target          |
| 7001      | socket-server (games + rmhmusic) | Node               | Apache `/socket/`           |
| 7676      | rmhbox                           | Node               | Apache `/rmhbox-ws/`        |
| 7003      | rmhtube                          | Node               | Apache `/rmhtube-ws/`       |
| 7004      | recap health                     | Go (in supervisor) | internal                    |
| 7007      | assets                           | Go                 | internal (Apache off-disk CDN path) |
| 7008      | status                           | Go                 | dashboard                   |
| 7100      | ledger                           | Go                 | not deployed (internal/ledger, no binary) |
| 9090      | supervisor metrics               | Go                 | internal (Prometheus)       |
| 6379      | redis (LRU cache) · redis-state (durable, dormant) | infra | internal        |
| 9000/9001 | MinIO                            | infra              | internal                    |

(The `ladder-worker`, `homes-worker`, and `jobs` Node workers bind no port.
The old Go `gateway`/`gamehub`/`rmhmusic`:7002 hubs were removed with the Go
realtime topology.)

## 6. Auth across tiers

- **Issuance:** Better Auth in the web tier (`lib/auth.ts`) — cookies +
  OAuth + passkeys + Stripe customer creation. `/api/auth/$` splat route.
- **Node hubs:** validate the session token against the shared `session`
  table (each hub has its own `auth.ts`; socket-server is soft-auth,
  rmhbox/rmhtube/rmhmusic hard-auth).
- **Go services:** `pkg/auth` runs the same SQL lookup where a service needs
  identity. They are internal-only (workers + `status` + `assets`) and never
  terminate user-facing traffic — the old identity-injecting `gateway` was
  removed with the Go realtime topology.
- **Server-to-server:** shared-secret via `lib/internal-auth.ts`
  (`INTERNAL_API_SECRET`), used e.g. by workers bridging events to the web
  tier's SSE.

## 7. Data & media

- **PostgreSQL** via Prisma 7 (`@prisma/adapter-pg`) in Node and raw pgx in
  Go — one shared schema (`prisma/schema.prisma`, 234 models). Go models
  mirror Prisma column casing verbatim.
- **Media:** R2/S3 via `lib/storage/` (local-FS fallback for dev); MinIO
  provides the bucket locally; the Go `assets` service streams
  `/library /music /models /sprites` range-aware (main user path still goes
  through web/Apache under Compose).
- **Async work:** the `jobs` service (pg-boss over Postgres) drains durable
  queues — engagement progression, event reminders, the weekly digest email.
  The web tier is send-only; `jobs` owns queue maintenance/scheduling. With no
  `DATABASE_URL`, `jobs` exits and the web tier runs the work inline.
- **Redis:** two planes in Compose. `redis` (7.4, `allkeys-lru`, ~320 MB) is a
  best-effort **cache** the web tier uses (feed/view/presence). `redis-state`
  is a durable state plane (`noeviction` + AOF) for rate-limit counters, dirty
  view/counter buffers, and presence sets — **dormant by default** (profile
  `redis-state`); the app routes state keys there only once `REDIS_STATE_URL`
  is set, otherwise it falls back to the cache connection (`lib/redis.server.ts`).
  If Redis is entirely absent the web tier degrades to in-process. Node realtime
  hubs hold state process-locally (single-instance; no socket.io Redis adapter).

## 8. Observability

- **Client:** Core Web Vitals → `/api/rum`; uncaught errors →
  `/api/client-error` (installed in `app/routes/__root.tsx`).
- **Server:** structured JSON logs everywhere (Node `server/shared/logger.ts`,
  Go `pkg/log` with matching field names). Go services expose Prometheus
  metrics (`pkg/telemetry`); supervisor merges its workers' registries
  on :9090.
- **Status page:** the Go `status` service (7008) probes every service's
  `/health` + the DB and keeps uptime history on disk — designed to survive
  platform outages.
- **Deploy telemetry:** Discord webhooks + GitHub commit statuses from
  `deploy.sh`.

# rmhstudios deploy — Docker Compose (VPS)

Production and staging both run as **Docker Compose** stacks on a VPS behind
**Apache** (TLS terminated at **Cloudflare**). The web tier deploys **blue/green**
with a health-gated Apache port flip. This directory holds the Apache vhosts,
the blue/green hotswap script, Postgres/backup helpers, systemd units, and the
Terraform DNS config.

> The earlier **k3s + Helm/Traefik** deploy was **removed in the rewrite** — its
> scripts (`deploy-k8s.sh`, `deploy-go.sh`) and the `deploy/helm/` chart no
> longer exist. Compose (`/deploy.sh` + `/docker-compose.yml`) is the only
> deploy path. Runtime topology & the full pipeline:
> [`../docs/architecture.md`](../docs/architecture.md).

## What's in here

| Path                             | Purpose                                                              |
| -------------------------------- | ------------------------------------------------------------------- |
| `apache/`                        | vhosts (`rmhstudios.conf` — the front door + security headers/CSP) + the active-web-port include the hotswap flips |
| `hotswap-web.sh`                 | blue/green web swap: start new container on the spare port (7005 ⇄ 7015), health-gate, flip Apache, stop the old one |
| `docker/`                        | Docker daemon config / helpers                                      |
| `postgres/`                      | Postgres tuning + host setup (DB runs on the host, reached via `host.docker.internal`) |
| `backup/`                        | DB backup scripts (driven by the systemd timer)                    |
| `systemd/`                       | units: `rmh-db-backup.{service,timer}`, `rmhstudios-perf-tuning.service` |
| `terraform/`                     | Cloudflare **DNS** as code — see [`terraform/README.md`](./terraform/README.md) |
| `apply-cloudflare-cache-rules.sh`, `apply-perf-tuning.sh` | one-shot host/CDN tuning helpers                 |
| `disk-report.sh`, `move-docker-storage.sh` | disk diagnostics + moving Docker's data-root onto a separate volume |

## The deploy pipeline (push → production)

1. **Push to `main`** → `.github/workflows/deploy.yml` builds the **two images**
   (`rmhstudios-app` slim + `rmhstudios-app-full`) on a native ARM64 runner from
   one `Dockerfile`, pushes them to **GHCR** tagged with the commit SHA, then
   POSTs an **HMAC-signed** request to the VPS webhook listener.
2. The listener (`webhook-server.cjs`, `127.0.0.1:7002`) runs
   `./deploy.sh production <sha>`.
3. **`deploy.sh production <sha>`** (flock-serialized; reports to Discord +
   GitHub commit status): `git reset --hard <sha>` → **pull** the two GHCR
   images → sync static assets/avatars to R2 (background) →
   `prisma migrate deploy` in a throwaway container → `docker compose up -d
   --scale web=0` (everything except web) → **blue/green web hotswap**
   (`hotswap-web.sh`) → health checks → prune stale/rollback images.

`deploy.sh` takes `production` or `staging` and an optional SHA (no SHA deploys
the branch tip). It can also be run directly on the VPS.

## Automated deploys — CI build → GHCR → VPS pull

Every push to `main`, `.github/workflows/deploy.yml` builds the two images
**in GitHub Actions** (native ARM64 runner, matching the Oracle ARM VPS), pushes
them to GHCR tagged with the commit SHA, then POSTs an HMAC-signed request to the
VPS webhook listener (`webhook-server.cjs`). The listener runs
`./deploy.sh production <sha>`, which **pulls** those images (no on-host build),
migrates, and blue/green-swaps. The listener self-serializes via `deploy.sh`'s
flock, and `deploy.sh` owns the `deploy/production` commit status.

Why the listener is triggered by CI (not by GitHub's raw push webhook): the image
must exist in GHCR *before* the deploy runs, so the deploy is sequenced after the
build. **Remove GitHub's old push webhook** (repo Settings → Webhooks) so only this
workflow drives the listener.

One-time setup:

1. **Repo variables** (Settings → Secrets and variables → Actions → **Variables**).
   These are baked into the client bundle by `vite build`, so they must be the
   **production** values. They are public (they end up in client JS / are public
   URLs), so they belong in variables, not secrets. Keep them in sync with the
   VPS `.env.production`:
   - `PROD_BETTER_AUTH_URL`
   - `PROD_VITE_BETTER_AUTH_URL`
   - `PROD_VITE_SOCKET_URL`
   - `PROD_VITE_RMHBOX_SOCKET_URL`
   - `PROD_VITE_RMHTUBE_SOCKET_URL`
   - `PROD_VITE_DISCORD_ACTIVITY_CLIENT_ID`
   - `PROD_VITE_CDN_BASE_URL`
2. **Repo secrets**:
   - `DEPLOY_WEBHOOK_URL` — the public URL that proxies to the listener
     (`127.0.0.1:7002/webhook`), e.g. `https://<host>/webhook`.
   - `WEBHOOK_SECRET` — the **same** value as the listener's `WEBHOOK_SECRET` env
     (the HMAC key). Nothing deploys unless the signatures match.
   - `DEEPSEEK_API_KEY` — optional (library cover titles); may be unset.
   - `GITHUB_TOKEN` (built-in) pushes the images — no PAT needed in CI.
3. **On the VPS**, give `deploy.sh` a way to pull the GHCR packages. Either make
   the two packages (`rmhstudios-app`, `rmhstudios-app-full`) **public** on GHCR,
   or export a token with `read:packages` for the deploy user (the listener's
   systemd unit / `.env`):
   ```bash
   GHCR_TOKEN=<PAT with read:packages>   # defaults to $GITHUB_TOKEN if that's set
   GHCR_USER=stickms
   ```
   `deploy.sh` also uses `GITHUB_TOKEN` (with `repo`/`repo:status`) for the commit
   status — a single classic PAT with `repo` + `read:packages` covers both.

Manual runs: Actions → deploy → "Run workflow" (rebuilds + re-triggers), or on the
VPS directly `./deploy.sh production <sha>` (or with no SHA to deploy the branch
tip). Deploy history + the build logs live in the Actions tab; the `deploy.sh`
run log lives on the VPS (`/home/rmhstudios/webhook.log`).

> The old SSH-based flow (`DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY`) is
> retired — those secrets are no longer used and can be deleted.

### Library covers

No special handling — the static bundled-PDF library was retired. The catalogue
JSON (`data/library-metadata.json`) is empty, the bundled PDFs were removed from
the repo, and `lib/library.server.ts` now reads `LibraryDocument` rows (DB) with
covers served from R2 (`coverKey` → `asset()`). Nothing about the library depends
on where the image is built, so moving the build to CI changes nothing here. (The
old host-side cover-render step in `deploy.sh` was a no-op and has been removed.)

## Rollback

`deploy.sh` keeps the previous SHA-tagged images (one per env). To roll back,
re-run `./deploy.sh <env> <previous-sha>` on the VPS — it pulls (or reuses) that
SHA's images and blue/green-swaps back. Replaced Node workers can be revived by
restoring their compose command blocks (see
[`../docs/runbooks/2026-06-22-go-runtime-cutover.md`](../docs/runbooks/2026-06-22-go-runtime-cutover.md)).

## Disk usage on the VPS

The heavy build runs in CI, so the VPS no longer keeps a BuildKit build cache
— it only holds the **pulled** images. `deploy.sh` prunes dangling images and
keeps at most **2** SHA-tagged rollback images per environment (dropping to 1 if
free space falls under the headroom). Tune via `DEPLOY_HEADROOM_GB` (2) and
`DEPLOY_PULL_RESERVE_GB` (6 — transient space the incoming image layers need).

If the disk fills, find out what's actually using it before blaming Docker:

```bash
df -h /                                   # is the disk really full?
sudo du -xh --max-depth=1 / | sort -h     # where the space is
docker system df                          # Docker's own split: images vs cache
./deploy/disk-report.sh                   # read-only summary
```

The usual real culprit is non-Docker cruft in `/home` (dev-tool caches like
`~/.vscode-server`, `~/.cache`, `~/.npm`, `~/go`) that `docker system df` won't
show. Docker's own footprint is small — `runner-full` is `FROM` the slim image,
so they largely share layers.

**If you attach a genuinely separate large volume**, move Docker's data-root onto
it so the images no longer compete with the root disk (one-time, brief downtime):

```bash
sudo ./deploy/move-docker-storage.sh /mnt/<separate-volume>/docker
```

It copies `/var/lib/docker` and repoints the daemon (old copy kept → reversible),
refusing if the target lacks `used + 5 GB` headroom.

## Scaling note

The realtime tier is stateful: `socket`/`rmhbox`/`rmhtube` hold in-memory
game/lobby state and there is no socket.io Redis adapter, so they run
single-instance. `web` runs multiple Nitro cluster workers in one container; the
`redis`/`redis-state` planes back caching and durable rate-limit/presence state.
Horizontal scaling of the realtime hubs would need sticky sessions plus a shared
backplane first — see the scalability audit in
[`../docs/scalability-audit-2026-07-17.md`](../docs/scalability-audit-2026-07-17.md).

# rmhstudios deploy — k3s + Helm

This directory holds the k3s/Helm/Terraform deploy. The legacy Docker-Compose
deploy (`/deploy.sh` + `/docker-compose.yml`) stays in place as a fallback.

## One-time VPS setup

1. **Install k3s** (bundles Traefik ingress + local-path PVC provisioner):
   ```bash
   curl -sfL https://get.k3s.io | sh -
   sudo k3s kubectl get nodes        # node should be Ready
   ```
2. **Give the deploy user kubectl + ctr access:**
   ```bash
   sudo mkdir -p ~/.kube
   sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
   sudo chown "$(id -u):$(id -g)" ~/.kube/config
   # deploy-k8s.sh uses `sudo k3s ctr` to import images — ensure the deploy
   # user has passwordless sudo for `k3s ctr`, or run the deploy as root.
   ```
3. **TLS (if using cert-manager):** install cert-manager and a ClusterIssuer,
   then set `ingress.tls.secretName`. Alternatively terminate TLS at Cloudflare.

## First deploy

```bash
cd /home/rmhstudios/rmhstudios.com
# Edit deploy/helm/rmhstudios/values-prod.yaml — set the four real hostnames.
./deploy/deploy-k8s.sh production
```

This builds the image (Compose), imports it into k3s, syncs the Secret from
`.env.production`, runs the Prisma migration hook, then rolls the 8 Deployments.
`--atomic` auto-rolls-back if anything fails.

## Smoke test (on the VPS, after first deploy)

```bash
kubectl -n rmhstudios get pods                       # all Running/Ready
kubectl -n rmhstudios logs job/rmhstudios-migrate    # "[migrate] done"
kubectl -n rmhstudios get ingress                    # hosts listed
curl -fsS -H "Host: <app_host>" http://127.0.0.1/    # via Traefik
```

## Cutover (reversible)

1. Run `./deploy/deploy-k8s.sh production` and pass the smoke test while the
   old Compose stack is still up (k3s Traefik binds :80/:443 — stop the old
   reverse proxy / Compose web only when ready to flip).
2. Point the webhook at the new script:
   ```bash
   # in the webhook server's systemd unit / env:
   DEPLOY_SCRIPT=/home/rmhstudios/rmhstudios.com/deploy/deploy-k8s.sh
   sudo systemctl restart rmhstudios-webhook   # or however it is supervised
   ```
3. **Rollback to Compose:** unset `DEPLOY_SCRIPT` (back to `deploy.sh`), restart
   the webhook, and `docker compose -p rmhstudios-prod --env-file .env.production up -d`.

## Day-2 ops

- Roll back one release:  `helm -n rmhstudios rollback rmhstudios`
- Scale web (after multi-node + RWX):  `kubectl -n rmhstudios scale deploy/rmhstudios-web --replicas=3`
- Tail a service:  `kubectl -n rmhstudios logs -f deploy/rmhstudios-socket`
- DNS changes:  see `deploy/terraform/README.md`

## Automated deploys — CI build → GHCR → VPS pull

Every push to `main`, `.github/workflows/deploy.yml` builds the two images
**in GitHub Actions** (native ARM64 runner, matching the Oracle ARM VPS), pushes
them to GHCR tagged with the commit SHA, then POSTs an HMAC-signed request to the
VPS webhook listener (`webhook-server.cjs`). The listener runs
`./deploy.sh production <sha>`, which **pulls** those images (no on-host build),
migrates, and blue/green-swaps. The listener still self-serializes via `deploy.sh`'s
flock, and `deploy.sh` still owns the `deploy/production` commit status.

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

## Disk usage on the VPS

The heavy build now runs in CI, so the VPS no longer keeps a BuildKit build cache
— it only holds the **pulled** images. `deploy.sh` prunes dangling images and
keeps at most **2** SHA-tagged rollback images per environment (dropping to 1 if
free space falls under the headroom). Tune via `DEPLOY_HEADROOM_GB` (2) and
`DEPLOY_PULL_RESERVE_GB` (6 — transient space the incoming image layers need).

> The old on-host build knobs are gone: `setup-buildx-cache.sh`,
> `docker-compose.cache.yml`, and the `DEPLOY_BUILDKIT_CACHE` /
> `DEPLOY_BUILD_RESERVE_GB` / `DEPLOY_IMAGE_RESERVE_GB` env vars are no longer
> read by `deploy.sh`.

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

## Multi-node scaling

The deploy is already **wired for a registry** — switching to multi-node is an
env var on the deploy, plus two storage changes.

### 1. Registry (wired)

Set `REGISTRY` (and optionally `REGISTRY_PULL_SECRET`) before deploying. The
script then pushes the image instead of importing it locally, and flips the
chart to `pullPolicy: IfNotPresent` with the full registry path:

```bash
# Public/self-hosted registry, no auth:
REGISTRY=registry.rmhstudios.com ./deploy/deploy-k8s.sh production

# GHCR or any private registry (create the pull secret once):
kubectl -n rmhstudios create secret docker-registry regcred \
  --docker-server=ghcr.io --docker-username=<user> --docker-password=<token>
REGISTRY=ghcr.io/<owner> REGISTRY_PULL_SECRET=regcred ./deploy/deploy-k8s.sh production
```

Unset `REGISTRY` → single-node behavior (local `k3s ctr` import, `pullPolicy: Never`).

### 2. Shared storage (`MULTI-NODE SEAM` in pvc.yaml)

`local-path` is node-local RWO. For pods to share `/app/db` across nodes, switch
to a `ReadWriteMany` class (NFS / Longhorn / Rook) and set
`data.storageClass` + the PVC `accessModes` accordingly.

### 3. discord-bot repo mount (`MULTI-NODE SEAM` in deployment.yaml)

The `hostPath` repo mount pins discord-bot to one node. Either keep it pinned
with a `nodeSelector`/affinity, or move its git-worktree workdir onto the shared
RWX volume.

### Then scale

```bash
kubectl -n rmhstudios scale deploy/rmhstudios-web --replicas=4
kubectl -n rmhstudios scale deploy/rmhstudios-socket --replicas=3
```

> Stateful realtime note: `socket`/`rmhbox`/`rmhtube` hold in-memory game/lobby
> state. Scaling them past 1 replica needs sticky sessions at the ingress AND a
> shared backplane (e.g. socket.io Redis adapter) — otherwise clients on
> different replicas can't see each other. `web` and the workers scale freely;
> the realtime tier needs that backplane first. See the scaling discussion in
> the migration plan.

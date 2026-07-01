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

## Faster builds (`deploy.sh` compose path)

The single-host `deploy.sh` build is dominated by the Vite frontend build. Two
opt-in knobs keep it fast, especially on a disk-constrained host that keeps
wiping its local BuildKit cache.

### Shared / remote BuildKit cache

Import & export the BuildKit layer cache to a registry so a fresh — or
disk-pressure-wiped — host repopulates the deps / prisma / vite stages from
remote instead of rebuilding them cold.

```bash
# 1. Provision the container-driver builder once (mode=max registry export needs
#    it; the default docker driver can't). Idempotent.
./deploy/setup-buildx-cache.sh

# 2. If the registry is private, log in once so the builder can push/pull cache.
docker login ghcr.io

# 3. Set on the deploy env (webhook unit / .env):
DEPLOY_BUILDKIT_CACHE=ghcr.io/stickms/rmh/buildcache
# optional, only if you renamed the builder:
DEPLOY_BUILDX_BUILDER=rmhstudios-cache
```

`deploy.sh` enables the cache only when the env var is set **and** the builder
exists; otherwise it warns and falls back to the local cache (never fails the
build). The `-full` image gets its own `…-full` cache ref automatically. The
deploy LRU-trims the container builder's cache to the same disk-calibrated cap
as the local one, so it can't grow unbounded. Disable any time by unsetting
`DEPLOY_BUILDKIT_CACHE`.

### Disk pressure

On the small root disk the real hog is **images**, not cache: this monorepo's
`node_modules` + ~1.5 GB `.output`, plus Chromium on the full image, mean a
couple of image + rollback copies pin ~30 GB. That leaves too little room to
build, so the deploy wipes the whole BuildKit cache to make space — forcing a
cold `vite build` every deploy.

**The fix — put Docker's storage on the large volume** you already use for DB
storage (`STORAGE_PATH`). One-time, host-level, brief downtime (Docker restarts):

```bash
sudo ./deploy/move-docker-storage.sh          # target defaults to <STORAGE volume>/docker
```

It rsyncs `/var/lib/docker` to the big volume and repoints the daemon (the old
copy is kept until you remove it, so it's reversible). Afterwards images live on
the big volume, `deploy.sh`'s cache cap self-calibrates to it (`cache_keep_gb`
reads the volume backing Docker's data dir), and the warm `.vinxi`/pnpm cache
survives between deploys — no more wipes, no new deploy env var.

Interim relief without the migration: the deploy keeps only **1** rollback image
per environment (was 2) and caps the cache at `total − image reserve − build
reserve − headroom`. Tune via `DEPLOY_IMAGE_RESERVE_GB` (12),
`DEPLOY_BUILD_RESERVE_GB` (8), `DEPLOY_HEADROOM_GB` (2).

See where the disk actually goes (read-only):

```bash
./deploy/disk-report.sh
```

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

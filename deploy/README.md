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

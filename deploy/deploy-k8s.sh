#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rmhstudios.com — k3s + Helm deploy (run layer).
# Build stays on Docker Compose (identical caching/build-args). Only the run
# layer changes: image -> k3s containerd, `compose up` -> `helm upgrade`.
#
# Usage: ./deploy/deploy-k8s.sh production
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENVIRONMENT="${1:-production}"
[ "$ENVIRONMENT" = "production" ] || { echo "FATAL: only 'production' is supported"; exit 1; }

REPO_DIR="/home/rmhstudios/rmhstudios.com"
ENV_FILE=".env.production"
PROJECT_NAME="rmhstudios-prod"
RELEASE="rmhstudios"
NAMESPACE="rmhstudios"
CHART_DIR="deploy/helm/rmhstudios"
SECRET_NAME="rmhstudios-secrets"

# ── Registry mode (multi-node) ───────────────────────────────────────────────
# Single-node (default): REGISTRY unset → build, import into k3s containerd,
#   deploy with the bare image name + pullPolicy=Never.
# Multi-node: export REGISTRY=registry.example.com (or ghcr.io/owner) → build,
#   push to the registry, deploy with the full path + pullPolicy=IfNotPresent so
#   every node pulls the same image. Set REGISTRY_PULL_SECRET for a private one.
REGISTRY="${REGISTRY:-}"
REGISTRY_PULL_SECRET="${REGISTRY_PULL_SECRET:-}"
if [ -n "$REGISTRY" ]; then
    IMAGE_REPO="${REGISTRY%/}/rmhstudios"
    PULL_POLICY="IfNotPresent"
else
    IMAGE_REPO="rmhstudios"
    PULL_POLICY="Never"
fi

LOCKFILE="/tmp/autodeploy-k8s.lock"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [k8s] $1"; }

cd "$REPO_DIR" || { echo "FATAL: cannot cd to $REPO_DIR"; exit 1; }

# Single-flight lock.
exec 200>>"$LOCKFILE"
flock -n 200 || { log "Another deploy is running. Exiting."; exit 0; }

[ -f "$ENV_FILE" ] || { log "FATAL: $ENV_FILE missing"; exit 1; }

# ── Step 1: Pull latest ──────────────────────────────────────────────────────
log "Fetching latest code..."
git fetch origin main
git checkout main 2>/dev/null || git checkout -b main origin/main
git reset --hard origin/main
GIT_SHA="$(git rev-parse --short HEAD)"
log "Deploying $GIT_SHA"

# ── Step 2: Build image via Compose (unchanged caching/build-args) ───────────
log "Building image (docker compose build)..."
docker compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" build web

# Resolve the image Compose just built (COMPOSE_PROJECT_NAME-app:latest) and
# retag to rmhstudios:<sha> for Helm.
BUILT_IMAGE="$(docker compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" config --images web | head -1)"
[ -n "$BUILT_IMAGE" ] || { log "FATAL: could not resolve built image name"; exit 1; }
docker tag "$BUILT_IMAGE" "${IMAGE_REPO}:${GIT_SHA}"
log "Tagged ${IMAGE_REPO}:${GIT_SHA} (from $BUILT_IMAGE)"

# ── Step 3: Make the image available to the cluster ──────────────────────────
if [ -n "$REGISTRY" ]; then
    # Multi-node: push to the registry so every node can pull it.
    log "Pushing ${IMAGE_REPO}:${GIT_SHA} to registry..."
    docker push "${IMAGE_REPO}:${GIT_SHA}"
else
    # Single-node: k3s uses its own containerd, not docker — import directly.
    # Requires passwordless sudo for `k3s ctr` (a documented one-time setup step).
    # Preflight it so a webhook-triggered run fails legibly instead of hanging on
    # a sudo password prompt or emitting a bare "sudo: a password is required".
    sudo -n k3s ctr version >/dev/null 2>&1 || {
        log "FATAL: passwordless sudo for 'k3s ctr' is not configured (see deploy/README.md)."
        exit 1
    }
    log "Importing image into k3s containerd..."
    docker save "${IMAGE_REPO}:${GIT_SHA}" | sudo k3s ctr images import -
fi

# ── Step 4: Sync Secret from .env.production (server-side, never in git) ──────
# `kubectl apply` on a Secret replaces .data wholesale, so keys removed from
# .env.production are also removed from the Secret (no stale-key drift).
log "Syncing Secret ${SECRET_NAME}..."
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic "$SECRET_NAME" \
  --namespace "$NAMESPACE" \
  --from-env-file="$ENV_FILE" \
  --dry-run=client -o yaml | kubectl apply -f -

# ── Step 5: helm upgrade (atomic: auto-rollback on hook/probe failure) ───────
log "helm upgrade --install (atomic, repo=${IMAGE_REPO}, pullPolicy=${PULL_POLICY})..."
HELM_SET_ARGS=(
  --set image.repository="$IMAGE_REPO"
  --set image.tag="$GIT_SHA"
  --set image.pullPolicy="$PULL_POLICY"
)
if [ -n "$REGISTRY_PULL_SECRET" ]; then
    HELM_SET_ARGS+=(--set "image.pullSecrets={${REGISTRY_PULL_SECRET}}")
fi
helm upgrade --install "$RELEASE" "$CHART_DIR" \
  --namespace "$NAMESPACE" \
  -f "${CHART_DIR}/values-prod.yaml" \
  "${HELM_SET_ARGS[@]}" \
  --atomic --wait --timeout 10m

# ── Step 6: Prune old local images (keep recent for manual rollback) ─────────
log "Pruning dangling docker images..."
docker image prune -f >/dev/null 2>&1 || true

log "=== Deploy complete ($RELEASE @ $GIT_SHA) ==="

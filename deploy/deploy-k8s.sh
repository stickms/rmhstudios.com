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
IMAGE_REPO="rmhstudios"

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

# ── Step 3: Import image into k3s containerd ─────────────────────────────────
# k3s uses its own containerd, not docker — the image must be imported.
# Requires sudo for `k3s ctr` (document in runbook).
log "Importing image into k3s..."
docker save "${IMAGE_REPO}:${GIT_SHA}" | sudo k3s ctr images import -

# ── Step 4: Sync Secret from .env.production (server-side, never in git) ──────
log "Syncing Secret ${SECRET_NAME}..."
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic "$SECRET_NAME" \
  --namespace "$NAMESPACE" \
  --from-env-file="$ENV_FILE" \
  --dry-run=client -o yaml | kubectl apply -f -

# ── Step 5: helm upgrade (atomic: auto-rollback on hook/probe failure) ───────
log "helm upgrade --install (atomic)..."
helm upgrade --install "$RELEASE" "$CHART_DIR" \
  --namespace "$NAMESPACE" \
  -f "${CHART_DIR}/values-prod.yaml" \
  --set image.tag="$GIT_SHA" \
  --atomic --wait --timeout 10m

# ── Step 6: Prune old local images (keep recent for manual rollback) ─────────
log "Pruning dangling docker images..."
docker image prune -f >/dev/null 2>&1 || true

log "=== Deploy complete ($RELEASE @ $GIT_SHA) ==="

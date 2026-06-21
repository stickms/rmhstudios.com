#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-go.sh — build + ship the Go microservices fleet.
#
# Parallel to PR #121's deploy/deploy-k8s.sh, and intentionally reuses the same
# Secret (rmhstudios-secrets from .env.production) and the same single-node vs.
# registry switch. Run AFTER the rmhstudios chart (the SSR web tier) is up.
#
#   ./deploy/deploy-go.sh production
#   REGISTRY=registry.example.com ./deploy/deploy-go.sh production   # multi-node
#
# Steps: build one image per service → import to k3s (or push to a registry) →
# helm upgrade --install --atomic --wait.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENVNAME="${1:-production}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GODIR="$ROOT/go-services"
CHART="$ROOT/deploy/helm/rmhstudios-go"
SERVICES=(gateway gamehub rmhmusic rmhtube rmhbox recap doctrine-worker vibe-worker discord-bot assets)
SHA="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo dev)"
REGISTRY="${REGISTRY:-}"
RELEASE="${RELEASE:-rmhstudios-go}"

log() { printf '\033[1;36m[deploy-go]\033[0m %s\n' "$*"; }

extra_pkgs() {
  case "$1" in
    vibe-worker) echo "chromium nss freetype harfbuzz ttf-freefont" ;;
    discord-bot) echo "git openssh-client" ;;
    *) echo "" ;;
  esac
}

log "building ${#SERVICES[@]} service images at tag $SHA"
for svc in "${SERVICES[@]}"; do
  img="rmhstudios-go-${svc}:${SHA}"
  [ -n "$REGISTRY" ] && img="${REGISTRY}/${img}"
  log "  → $img"
  docker build -f "$GODIR/Dockerfile" \
    --build-arg SERVICE="$svc" \
    --build-arg EXTRA_PKGS="$(extra_pkgs "$svc")" \
    -t "$img" "$GODIR"

  if [ -n "$REGISTRY" ]; then
    docker push "$img"
  else
    # Single-node k3s: import straight into containerd (same trick as PR #121).
    sudo -n k3s ctr images import <(docker save "$img") \
      || { echo "FATAL: 'sudo -n k3s ctr' failed — grant passwordless sudo for k3s ctr"; exit 1; }
  fi
done

log "helm upgrade --install $RELEASE"
helm upgrade --install "$RELEASE" "$CHART" \
  -f "$CHART/values-prod.yaml" \
  --set image.tag="$SHA" \
  --set image.registry="$REGISTRY" \
  --atomic --wait --timeout 5m

log "done. Rollback with: helm rollback $RELEASE"

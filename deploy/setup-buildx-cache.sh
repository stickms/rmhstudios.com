#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-buildx-cache.sh — one-time provisioning for the shared registry cache.
#
# The deploy (deploy.sh) can import/export the Docker BuildKit layer cache to a
# registry so a fresh or disk-pressure-wiped host repopulates the deps/prisma/
# vite stages from remote instead of rebuilding them cold. That requires a buildx
# builder using the `docker-container` driver — the default `docker` driver
# cannot export mode=max cache to a registry.
#
# Run this ONCE per host (idempotent). Then set on the deploy environment:
#     DEPLOY_BUILDKIT_CACHE=<registry>/<repo>/buildcache   # e.g. ghcr.io/stickms/rmh/buildcache
# and (if you used a non-default name) DEPLOY_BUILDX_BUILDER=<name>.
#
# deploy.sh checks the builder exists before enabling the cache; if it's missing
# it falls back to the local cache and warns, so provisioning is safe to defer.
#
# Env:
#   DEPLOY_BUILDX_BUILDER   builder name to create (default: rmhstudios-cache)
#   DOCKER_BIN              docker binary (default: docker)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOCKER_BIN="${DOCKER_BIN:-docker}"
BUILDER="${DEPLOY_BUILDX_BUILDER:-rmhstudios-cache}"

if ! "$DOCKER_BIN" buildx version >/dev/null 2>&1; then
    echo "ERROR: 'docker buildx' is not available. Install the buildx plugin first." >&2
    exit 1
fi

if "$DOCKER_BIN" buildx inspect "$BUILDER" >/dev/null 2>&1; then
    echo "buildx builder '$BUILDER' already exists — ensuring it is bootstrapped."
    "$DOCKER_BIN" buildx inspect --bootstrap "$BUILDER" >/dev/null
else
    echo "Creating buildx builder '$BUILDER' (docker-container driver)..."
    # gc=true lets BuildKit garbage-collect its own cache; the deploy additionally
    # LRU-trims this builder to the disk-calibrated cap after each build.
    "$DOCKER_BIN" buildx create \
        --name "$BUILDER" \
        --driver docker-container \
        --driver-opt "network=host" \
        --buildkitd-flags '--oci-worker-gc' \
        --bootstrap >/dev/null
    echo "Created and bootstrapped '$BUILDER'."
fi

# If the target registry needs auth, `docker login <registry>` on this host once;
# the container builder reuses the host's ~/.docker/config.json credentials.
cat <<EOF

Done. To enable the shared registry cache on deploys, set in the deploy env:

    DEPLOY_BUILDKIT_CACHE=<registry>/<repo>/buildcache
    # optional, only if you changed the name above:
    DEPLOY_BUILDX_BUILDER=${BUILDER}

If the registry is private, run 'docker login <registry>' on this host once.
Disable any time by unsetting DEPLOY_BUILDKIT_CACHE (deploy falls back to local
cache). Remove the builder with: ${DOCKER_BIN} buildx rm ${BUILDER}
EOF

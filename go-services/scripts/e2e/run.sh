#!/usr/bin/env bash
#
# End-to-end orchestration for the Go microservices.
#
# Starts a throwaway Postgres, loads the minimal schema, builds and launches the
# gamehub + rmhtube binaries inside a golang:1.23-alpine container on a shared
# docker network, waits for their /health, then runs `go test -tags e2e ./e2e/...`
# against the live binaries. Everything is torn down on exit.
#
# Usage:  ./scripts/e2e/run.sh
# Requires: docker.
set -euo pipefail

# ── Resolve paths ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"   # go-services/

# ── --no-docker mode (CI) ─────────────────────────────────────────────────────
# In CI a Postgres service container + a local Go toolchain are already present,
# and DATABASE_URL points at that Postgres (schema pre-loaded by the workflow).
# We then just build + launch the binaries on the host and run the e2e tests —
# no nested docker. Local default (no flag) uses the self-contained docker path.
if [ "${1:-}" = "--no-docker" ]; then
  : "${DATABASE_URL:?--no-docker requires DATABASE_URL to point at a ready Postgres}"
  cd "${REPO_DIR}"
  echo "==> [no-docker] building gamehub + rmhtube"
  CGO_ENABLED=0 go build -o /tmp/gamehub ./cmd/gamehub
  CGO_ENABLED=0 go build -o /tmp/rmhtube ./cmd/rmhtube
  echo "==> [no-docker] starting services"
  SOCKET_PORT=7001 /tmp/gamehub & GAMEHUB_PID=$!
  RMHTUBE_PORT=7003 /tmp/rmhtube & RMHTUBE_PID=$!
  trap 'kill "${GAMEHUB_PID}" "${RMHTUBE_PID}" 2>/dev/null || true' EXIT
  for hp in gamehub:7001 rmhtube:7003; do
    name="${hp%%:*}"; port="${hp##*:}"
    for i in $(seq 1 60); do
      if curl -fsS "http://localhost:${port}/health" >/dev/null 2>&1; then echo "    ${name} healthy"; break; fi
      [ "${i}" -eq 60 ] && { echo "!! ${name} not healthy on :${port}" >&2; exit 1; }
      sleep 0.5
    done
  done
  echo "==> [no-docker] running e2e tests"
  E2E_DATABASE_URL="${DATABASE_URL}" \
  E2E_GAMEHUB_URL="ws://localhost:7001/socket/" \
  E2E_RMHTUBE_URL="ws://localhost:7003/rmhtube-ws/" \
    go test -tags e2e -v ./e2e/...
  echo "==> [no-docker] e2e run complete"
  exit 0
fi

# ── Config ────────────────────────────────────────────────────────────────────
RUN_ID="$(date +%s)-$$"
NETWORK="rmhgo-e2e-net-${RUN_ID}"
PG_CONTAINER="rmhgo-e2e-pg-${RUN_ID}"
APP_CONTAINER="rmhgo-e2e-app-${RUN_ID}"

PG_IMAGE="postgres:16-alpine"
GO_IMAGE="golang:1.23-alpine"

DATABASE_URL="postgres://postgres:postgres@pg:5432/rmh?sslmode=disable"

MODCACHE_VOL="rmhgo-modcache"
BUILDCACHE_VOL="rmhgo-buildcache"

# ── Cleanup (trap) ────────────────────────────────────────────────────────────
cleanup() {
  echo "==> Cleaning up containers + network"
  docker rm -f "${APP_CONTAINER}" >/dev/null 2>&1 || true
  docker rm -f "${PG_CONTAINER}" >/dev/null 2>&1 || true
  docker network rm "${NETWORK}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ── Network ───────────────────────────────────────────────────────────────────
echo "==> Creating docker network ${NETWORK}"
docker network create "${NETWORK}" >/dev/null

# ── Cache volumes (persist module + build cache across runs) ───────────────────
docker volume create "${MODCACHE_VOL}" >/dev/null
docker volume create "${BUILDCACHE_VOL}" >/dev/null

# ── Postgres ──────────────────────────────────────────────────────────────────
echo "==> Starting Postgres (${PG_IMAGE})"
docker run -d --name "${PG_CONTAINER}" --network "${NETWORK}" \
  --network-alias pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=rmh \
  "${PG_IMAGE}" >/dev/null

echo "==> Waiting for Postgres readiness"
for i in $(seq 1 60); do
  if docker exec "${PG_CONTAINER}" pg_isready -U postgres -d rmh >/dev/null 2>&1; then
    echo "    Postgres ready"
    break
  fi
  if [ "${i}" -eq 60 ]; then
    echo "!! Postgres did not become ready in time" >&2
    docker logs "${PG_CONTAINER}" >&2 || true
    exit 1
  fi
  sleep 1
done

echo "==> Loading schema.sql"
docker exec -i "${PG_CONTAINER}" psql -v ON_ERROR_STOP=1 -U postgres -d rmh \
  < "${SCRIPT_DIR}/schema.sql"

# ── App container: build binaries, start services, run e2e tests ──────────────
echo "==> Building + running services + e2e tests (${GO_IMAGE})"
docker run --rm --name "${APP_CONTAINER}" --network "${NETWORK}" \
  -v "${REPO_DIR}:/src" \
  -v "${MODCACHE_VOL}:/go/pkg/mod" \
  -v "${BUILDCACHE_VOL}:/root/.cache/go-build" \
  -w /src \
  -e DATABASE_URL="${DATABASE_URL}" \
  -e CGO_ENABLED=0 \
  "${GO_IMAGE}" sh -euo pipefail -c '
    echo "--> go build gamehub + rmhtube"
    go build -o /tmp/gamehub ./cmd/gamehub
    go build -o /tmp/rmhtube ./cmd/rmhtube

    echo "--> starting gamehub (SOCKET_PORT=7001)"
    SOCKET_PORT=7001 DATABASE_URL="$DATABASE_URL" /tmp/gamehub &
    GAMEHUB_PID=$!

    echo "--> starting rmhtube (RMHTUBE_PORT=7003)"
    RMHTUBE_PORT=7003 DATABASE_URL="$DATABASE_URL" /tmp/rmhtube &
    RMHTUBE_PID=$!

    cleanup_app() {
      kill "$GAMEHUB_PID" "$RMHTUBE_PID" 2>/dev/null || true
    }
    trap cleanup_app EXIT

    wait_health() {
      name="$1"; port="$2"
      for i in $(seq 1 60); do
        if wget -q -O - "http://localhost:${port}/health" >/dev/null 2>&1; then
          echo "    ${name} healthy on :${port}"
          return 0
        fi
        sleep 0.5
      done
      echo "!! ${name} did not become healthy on :${port}" >&2
      return 1
    }

    echo "--> waiting for /health"
    wait_health gamehub 7001
    wait_health rmhtube 7003

    echo "--> running e2e tests"
    E2E_DATABASE_URL="$DATABASE_URL" \
    E2E_GAMEHUB_URL="ws://localhost:7001/socket/" \
    E2E_RMHTUBE_URL="ws://localhost:7003/rmhtube-ws/" \
      go test -tags e2e -v ./e2e/...
  '

echo "==> e2e run complete"

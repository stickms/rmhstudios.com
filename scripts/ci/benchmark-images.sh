#!/usr/bin/env bash
# Opt-in benchmark. Publishes only to an explicitly supplied benchmark registry.
# Use a dedicated builder/daemon for cold-pull trials; never prunes a shared daemon.
set -euo pipefail
: "${BENCH_REGISTRY:?Set a dedicated benchmark registry/repository prefix}"
[[ "$BENCH_REGISTRY" != ghcr.io/stickms/rmhstudios-app* ]] || { echo 'Use a separate benchmark repository' >&2; exit 1; }
mkdir -p .cache/image-benchmark
export IMAGE_WEB="${BENCH_REGISTRY}/web" IMAGE_FULL="${BENCH_REGISTRY}/full"
export STATIC_ASSET_VERSIONS=$(node scripts/static-asset-versions.mjs)
docker version > .cache/image-benchmark/docker-version.txt
for round in 1 2 3; do
  for compression in gzip zstd; do
    export IMAGE_COMPRESSION="$compression" GIT_SHA="bench-${compression}-${round}"
    start=$(date +%s)
    docker buildx bake -f docker-bake.hcl --push web full \
      --metadata-file ".cache/image-benchmark/${GIT_SHA}.json"
    published=$(date +%s)
    docker pull "${IMAGE_WEB}:${GIT_SHA}"
    docker pull "${IMAGE_FULL}:${GIT_SHA}"
    complete=$(date +%s)
    printf '{"round":%s,"compression":"%s","build_push_s":%s,"pull_s":%s,"daemon_cache":"retained"}\n' \
      "$round" "$compression" "$((published-start))" "$((complete-published))" \
      >> .cache/image-benchmark/timings.jsonl
  done
done

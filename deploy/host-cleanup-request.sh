#!/usr/bin/env bash
# Sourced by deploy.sh — ask root (through systemd) to clean host files the sandboxed
# deploy cannot reach: core dumps, journald, apt cache, stale temp files, old release
# images. Wiring: deploy/systemd/rmh-disk-cleanup-urgent.{path,service};
# root side: deploy/disk-cleanup-urgent.sh; the cleanup itself: deploy/disk-cleanup.sh.
#
#   host_cleanup_installed             0 when the urgent .path unit is enabled
#   request_host_cleanup <target_gb>   write the request, wait for the answer.
#                                      0 answered · 1 timed out · 2 unit not installed
# Sets HOST_CLEANUP_OUTCOME to a one-line description for the deploy log / refusal.
# Env: REPO_DIR · DEPLOY_RUN_DIR · DEPLOY_HOST_CLEANUP_WAIT_SECONDS (300) ·
#      HOST_CLEANUP_POLL_SECONDS (2) · SYSTEMCTL_BIN

HOST_CLEANUP_OUTCOME="host cleanup not requested"

host_cleanup_installed() {
    "${SYSTEMCTL_BIN:-systemctl}" is-enabled rmh-disk-cleanup-urgent.path > /dev/null 2>&1
}

request_host_cleanup() {
    local target="$1" dir wait_s poll nonce waited=0 got_nonce free status
    dir="${DEPLOY_RUN_DIR:-${REPO_DIR:-.}/.deploy-run}"
    wait_s="${DEPLOY_HOST_CLEANUP_WAIT_SECONDS:-300}"
    poll="${HOST_CLEANUP_POLL_SECONDS:-2}"
    if ! host_cleanup_installed; then
        HOST_CLEANUP_OUTCOME="host cleanup unavailable (rmh-disk-cleanup-urgent.path not installed)"
        return 2
    fi
    mkdir -p "$dir" || { HOST_CLEANUP_OUTCOME="host cleanup unavailable (cannot create $dir)"; return 2; }
    nonce=$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')
    rm -f "$dir/disk-done"
    # Write beside the request and rename into place so the path unit never sees half a file.
    printf '%s %s\n' "$target" "$nonce" > "$dir/.disk-request.$nonce" && mv -f "$dir/.disk-request.$nonce" "$dir/disk-request" || {
        HOST_CLEANUP_OUTCOME="host cleanup unavailable (cannot write the request)"
        return 2
    }
    while [ "$waited" -lt "$wait_s" ]; do
        if [ -r "$dir/disk-done" ]; then
            read -r got_nonce free status < "$dir/disk-done" || true
            if [ "${got_nonce:-}" = "$nonce" ]; then
                HOST_CLEANUP_OUTCOME="host cleanup finished (${free:-?}G free, exit ${status:-?})"
                return 0
            fi
        fi
        sleep "$poll"
        waited=$((waited + poll))
    done
    rm -f "$dir/disk-request"
    HOST_CLEANUP_OUTCOME="host cleanup did not answer within ${wait_s}s"
    return 1
}

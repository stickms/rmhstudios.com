#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# rmhstudios.com — Docker-based deploy script
#
# Usage:
#   ./deploy.sh production [SHA]  — deploy main branch to production containers
#   ./deploy.sh staging    [SHA]  — deploy staging branch to staging containers
#
# The optional SHA is the exact commit whose images GitHub Actions built and
# pushed to GHCR (the webhook listener passes it through). When omitted (a manual
# run), the branch tip is used.
#
# Image strategy (build now runs in CI):
#   - The heavy build (vibe-packages → vite build → esbuild server bundles → Go
#     binaries → Chromium) happens in GitHub Actions on native ARM64 runners and
#     is pushed to GHCR as two images (slim web + full supervisor/status), each
#     tagged with the full commit SHA. See .github/workflows/deploy.yml.
#   - This script PULLS those images and retags them to the local names
#     docker-compose.yml expects, so the compose file + blue/green hotswap are
#     unchanged. No BuildKit, no on-host cache mounts, no build-disk gymnastics.
#   - Pulled images are also tagged with the git SHA for instant rollback.
#   - Dangling + stale rollback images are pruned to bound disk usage.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# The release journal (deploy/release-state.mjs) runs on node, and every release
# writes to it before it does anything else. Fail here, loudly, rather than part-way
# through with a bare "node: command not found" and nothing recorded. The webhook
# listener puts its own node first on PATH; a manual run needs node on PATH too.
command -v node >/dev/null 2>&1 || {
    echo "FATAL: node is not on PATH ($PATH). deploy.sh needs it for the release journal." >&2
    exit 1
}

# ── Determine environment ────────────────────────────────────────────────────
ENVIRONMENT="${1:-production}"
# Optional: the exact commit CI built + pushed to GHCR. Passed by the webhook
# listener as $2; empty on a manual run (falls back to the branch tip).
DEPLOY_TARGET_SHA="${2:-}"
if [ -n "$DEPLOY_TARGET_SHA" ] && ! [[ "$DEPLOY_TARGET_SHA" =~ ^[0-9a-f]{7,40}$ ]]; then
    echo 'FATAL: the deployment target must be a commit SHA' >&2
    exit 1
fi
export DEPLOY_RELEASE_ID="${DEPLOY_RELEASE_ID:-release-$(date +%s)-$$}"
export DEPLOY_REQUESTED_AT="${DEPLOY_REQUESTED_AT:-$(date +%s)}"

case "$ENVIRONMENT" in
    production)
        BRANCH="main"
        ENV_FILE=".env.production"
        PROJECT_NAME="rmhstudios-prod"
        PORT_WEB=7005
        # Blue/green spare port for zero-downtime web hotswaps (deploy/hotswap-web.sh).
        PORT_WEB_GREEN=7015
        PORT_SOCKET=7001
        PORT_RMHBOX=7676
        PORT_RMHTUBE=7003
        PORT_STATUS=7008
        COMPOSE_PROFILES=""
        ;;
    staging)
        # DISABLED: staging environment is temporarily suspended.
        # To re-enable, remove the two lines below and restore the original block.
        echo "INFO: Staging environment is disabled. Deploy skipped."
        exit 0
        # BRANCH="staging"
        # ENV_FILE=".env.staging"
        # PROJECT_NAME="rmhstudios-staging"
        # PORT_WEB=8005
        # PORT_SOCKET=8001
        # PORT_RMHBOX=8676
        # PORT_RMHTUBE=8003
        # COMPOSE_PROFILES=""
        ;;
    *)
        echo "FATAL: Unknown environment '$ENVIRONMENT'. Use 'production' or 'staging'."
        exit 1
        ;;
esac

REMOTE_REPO="origin"
REPO_DIR="${REPO_DIR:-/home/rmhstudios/rmhstudios.com}"
export DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-${REPO_DIR}/.deploy/releases}"
release_event() {
    local sha="${GIT_SHA_FULL:-$DEPLOY_TARGET_SHA}"
    [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || return 0
    node "$REPO_DIR/deploy/release-state.mjs" record "$DEPLOY_STATE_DIR" "$DEPLOY_RELEASE_ID" "$sha" "$1"
}

LOCKFILE="${DEPLOY_LOCKFILE:-/tmp/autodeploy-${ENVIRONMENT}.lock}"
QUEUE_FILE="${DEPLOY_QUEUE_FILE:-/tmp/autodeploy-${ENVIRONMENT}.queue}"
DEPLOY_LOG="/tmp/autodeploy-${ENVIRONMENT}-$$.log"
DISCORD_WEBHOOK="${DISCORD_WEBHOOK_URL:-}"

# GitHub commit status API
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
GITHUB_REPO="stickms/rmhstudios.com"

# ── GHCR pull config ─────────────────────────────────────────────────────────
# The web (slim) + full (supervisor/status) images built by GitHub Actions.
# GHCR_TOKEN needs `read:packages`; it defaults to GITHUB_TOKEN so a single PAT
# with `repo` (commit status) + `read:packages` (image pull) covers both. If the
# packages are public, no token is needed (the pull works unauthenticated).
GHCR_REGISTRY="${GHCR_REGISTRY:-ghcr.io}"
GHCR_IMAGE="${GHCR_IMAGE:-ghcr.io/stickms/rmhstudios-app}"
GHCR_IMAGE_FULL="${GHCR_IMAGE_FULL:-ghcr.io/stickms/rmhstudios-app-full}"
GHCR_USER="${GHCR_USER:-stickms}"
GHCR_TOKEN="${GHCR_TOKEN:-$GITHUB_TOKEN}"

DOCKER_BIN=$(which docker 2>/dev/null || echo "/usr/bin/docker")
GIT_BIN=$(which git 2>/dev/null || echo "/usr/bin/git")

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$ENVIRONMENT] $1"
}

# Discord message id for the single push → build → deploy embed. When GitHub
# Actions posted the build-phase message, its id arrives via DEPLOY_DISCORD_MSG_ID
# (set by the webhook listener) and we EDIT that message instead of posting a new
# one. Empty on manual runs / when Actions didn't post — then we post our own.
DEPLOY_MSG_ID="${DEPLOY_DISCORD_MSG_ID:-}"

# ── Discord/GitHub curl with retries ─────────────────────────────────────────
# Wraps curl with retry logic + exponential backoff. Handles Discord 429
# rate-limit responses by respecting the Retry-After header.
# Usage: curl_retry [curl args...]
curl_retry() {
    local max_retries=4 attempt=0 delay=2 response http_code body retry_after
    while [ $attempt -lt $max_retries ]; do
        # -w outputs HTTP status code after body, separated by newline
        response=$(curl -s -w '\n%{http_code}' "$@" 2>/dev/null) || {
            attempt=$((attempt + 1))
            [ $attempt -lt $max_retries ] && { log "  Curl failed, retrying in ${delay}s... ($attempt/$max_retries)"; sleep "$delay"; delay=$((delay * 2)); continue; }
            return 1
        }
        http_code=$(printf '%s' "$response" | tail -1)
        body=$(printf '%s' "$response" | sed '$d')

        case "$http_code" in
            2*) printf '%s' "$body"; return 0 ;;
            429)
                # Discord rate limit — respect Retry-After if present
                retry_after=$(printf '%s' "$body" | grep -o '"retry_after" *: *[0-9.]*' | grep -o '[0-9.]*' | head -1)
                retry_after=${retry_after:-$delay}
                # ceil the float to int seconds + 1 for safety
                retry_after=$(printf '%.0f' "$retry_after" 2>/dev/null || echo "$delay")
                retry_after=$((retry_after + 1))
                log "  Discord rate limited (429), waiting ${retry_after}s... ($((attempt+1))/$max_retries)"
                sleep "$retry_after"
                ;;
            *)
                log "  HTTP $http_code from webhook, retrying in ${delay}s... ($((attempt+1))/$max_retries)"
                sleep "$delay"
                delay=$((delay * 2))
                ;;
        esac
        attempt=$((attempt + 1))
    done
    return 1
}

get_commit_info() {
    DEPLOY_SHORT_HASH=$("$GIT_BIN" rev-parse --short HEAD 2>/dev/null || echo "unknown")
    DEPLOY_COMMIT_MSG=$("$GIT_BIN" log -1 --pretty=%B 2>/dev/null || echo "(no commit message)")
    DEPLOY_AUTHOR=$("$GIT_BIN" log -1 --pretty='%an' 2>/dev/null || echo "unknown")
    # Escape special JSON characters and control characters
    DEPLOY_COMMIT_MSG=$(printf '%s' "$DEPLOY_COMMIT_MSG" | \
        sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g; s/\r/\\r/g' | \
        tr '\n' ' ' | \
        tr -d '\000-\011\013-\014\016-\037')
    DEPLOY_AUTHOR=$(printf '%s' "$DEPLOY_AUTHOR" | \
        sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g; s/\r/\\r/g' | \
        tr -d '\000-\011\013-\014\016-\037')
}

# ── GitHub commit status ────────────────────────────────────────────────────
# Sets the commit status on GitHub so PRs / branch views show deploy state.
# Usage: set_github_status <state> [description]
#   state: pending | success | failure | error
set_github_status() {
    [ -z "$GITHUB_TOKEN" ] && return 0
    local state="$1"
    local description="${2:-Deploy $ENVIRONMENT}"
    local full_sha
    full_sha=$("$GIT_BIN" rev-parse HEAD 2>/dev/null) || return 0

    local payload
    payload=$(printf '{"state":"%s","description":"%s","context":"deploy/%s"}' \
        "$state" "$description" "$ENVIRONMENT")

    curl_retry -X POST \
        -H "Authorization: token $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github+json" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "https://api.github.com/repos/${GITHUB_REPO}/statuses/${full_sha}" \
        > /dev/null || \
        log "WARNING: Failed to set GitHub commit status ($state) after retries."
}

send_deploy_started() {
    [ -z "$DISCORD_WEBHOOK" ] && { set_github_status "pending" "Deploy started"; return 0; }
    get_commit_info
    local env_label
    env_label=$(echo "$ENVIRONMENT" | tr '[:lower:]' '[:upper:]')
    # Purple "picked up on the VPS" state (color 0x9B59B6).
    local payload
    payload=$(printf '{"embeds":[{"title":"%s","description":"%s","color":%d,"footer":{"text":"%s"}}]}' \
        "[$env_label] Commit $DEPLOY_SHORT_HASH - deploying on VPS (pulling images)…" "$DEPLOY_COMMIT_MSG" 10181046 "$DEPLOY_AUTHOR")

    if [ -n "$DEPLOY_MSG_ID" ]; then
        # GitHub Actions already posted the build-phase message and handed us its
        # id — EDIT it so push → build → deploy stays a single evolving embed.
        curl_retry -X PATCH -H "Content-Type: application/json" \
            -d "$payload" "${DISCORD_WEBHOOK}/messages/${DEPLOY_MSG_ID}" > /dev/null || \
            log "WARNING: Failed to edit Discord deploy-started message after retries."
    else
        # No upstream message (manual run, or Actions' post failed) — post fresh.
        local response
        response=$(curl_retry -H "Content-Type: application/json" -d "$payload" "${DISCORD_WEBHOOK}?wait=true")
        DEPLOY_MSG_ID=$(printf '%s' "$response" | grep -o '"id": *"[^"]*"' | head -1 | cut -d'"' -f4)
        [ -z "$DEPLOY_MSG_ID" ] && log "WARNING: Failed to send or parse Discord webhook notification after retries."
    fi

    set_github_status "pending" "Deploy started ($DEPLOY_SHORT_HASH)"
    DEPLOY_ANNOUNCED=1
}

# ── On-call (deploy/oncall-send.sh → the off-box watchdog) ──────────────────
# The deploy channel is for everyone; every failed deploy also pages @oncall
# (Sev2): even one that left production on the old release blocks shipping.
# Best effort: oncall-send.sh always exits 0 and skips quietly when
# ONCALL_URL / ONCALL_SIGNING_SECRET are unset.
#   D01 Sev2  web rollback FAILED      — prod may be serving nothing good
#   D02 Sev2  web auto-rolled back     — prod is fine (old release), the commit isn't
#   D03 Sev2  deploy failed            — prod unchanged or partly updated
#   D04 Sev2  deploy died unreported   — see cleanup()
# A later successful deploy clears all of them.
DEPLOY_REPORTED=0
DEPLOY_IN_PROGRESS=0
oncall_deploy() {
    local status="$1" reason="$2" send="${REPO_DIR}/deploy/oncall-send.sh"
    [ -f "$send" ] || return 0
    local what="Commit ${DEPLOY_SHORT_HASH:-unknown} on ${ENVIRONMENT}"
    case "$status" in
        success)
            local id
            for id in D01 D02 D03 D04; do
                bash "$send" alert resolved "$id" 3 "deploy recovered" "$what deployed successfully" || true
            done ;;
        rolledback)
            bash "$send" alert firing D02 2 "Deploy auto-rolled back" "$what: $reason" || true ;;
        fail)
            case "$reason" in
                *"ROLLBACK FAILED"*)
                    bash "$send" alert firing D01 2 "Deploy rollback FAILED — production needs a human" "$what: $reason" || true ;;
                *)
                    bash "$send" alert firing D03 2 "Deploy failed" "$what: $reason" || true ;;
            esac ;;
    esac
}

# ── Deploy markers for the /admin/alarms graphs ──────────────────────────────
# Records each deploy result through the web tier's internal API (shared
# INTERNAL_API_SECRET from $ENV_FILE). Best effort: a few seconds at most, and
# a failure only means no marker on the graphs.
record_deploy_event() {
    local status="$1" reason="$2" secret url
    secret="${INTERNAL_API_SECRET:-}"
    [ -n "$secret" ] || secret=$(grep -E '^INTERNAL_API_SECRET=' "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true)
    [ -n "$secret" ] || return 0
    url="${DEPLOY_EVENT_URL:-https://rmhstudios.com/api/internal/ops/deploy-event}"
    local body
    body=$(printf '{"sha":"%s","status":"%s","detail":"%s"}' "${DEPLOY_SHORT_HASH:-unknown}" "$status" \
        "$(printf '%s' "$reason" | tr -d '"\\' | tr '\n\t' '  ' | cut -c1-280)")
    curl -fsS --max-time 8 -X POST "$url" -H 'content-type: application/json' \
        -H @<(printf 'x-internal-secret: %s\n' "$secret") --data-binary "$body" >/dev/null 2>&1 \
        || log "WARNING: could not record the deploy event (no marker on the graphs)."
}

update_deploy_status() {
    local status="$1"  # "success", "fail", or "rolledback" (web auto-rolled back)
    local reason="${2:-}"  # optional failure reason

    release_event "$status"
    DEPLOY_REPORTED=1
    oncall_deploy "$status" "$reason"
    record_deploy_event "$status" "$reason"

    if [ -z "$DISCORD_WEBHOOK" ]; then
        if [ "$status" = "success" ]; then
            set_github_status "success" "Deploy succeeded"
        elif [ "$status" = "rolledback" ]; then
            set_github_status "failure" "Auto-rolled back: $reason"
        else
            set_github_status "failure" "Deploy failed: $reason"
        fi
        return 0
    fi

    local color title env_label

    get_commit_info
    env_label=$(echo "$ENVIRONMENT" | tr '[:lower:]' '[:upper:]')

    if [ "$status" = "success" ]; then
        local elapsed mins secs
        elapsed=$(( $(date +%s) - DEPLOY_START_TIME ))
        mins=$(( elapsed / 60 ))
        secs=$(( elapsed % 60 ))
        color=65280    # green
        title=$(printf '[%s] Commit %s - deploy succeeded in %02d:%02d' "$env_label" "$DEPLOY_SHORT_HASH" "$mins" "$secs")
        set_github_status "success" "Deploy succeeded in ${mins}m${secs}s"
    elif [ "$status" = "rolledback" ]; then
        color=15105570 # orange — shipped, failed the bake, previous release restored
        title="[$env_label] Commit $DEPLOY_SHORT_HASH - ↩️ auto-rolled back to previous release"
        set_github_status "failure" "Auto-rolled back: $reason"
    else
        color=16711680 # red
        title="[$env_label] Commit $DEPLOY_SHORT_HASH - deploy failed: $reason"
        set_github_status "failure" "Deploy failed: $reason"
    fi

    local payload
    payload=$(printf '{"embeds":[{"title":"%s","description":"%s","color":%d,"fields":%s,"footer":{"text":"%s"}}]}' \
        "$title" "$DEPLOY_COMMIT_MSG" "$color" "$(stage_fields_json "$status")" "$DEPLOY_AUTHOR")

    if [ -n "$DEPLOY_MSG_ID" ]; then
        local edited=false
        if [ -f "$DEPLOY_LOG" ]; then
            # Try multipart PATCH with log file attached.
            # Use --form-string for payload_json to avoid curl interpreting
            # special characters (;, @) in the JSON as form-field directives.
            curl_retry -X PATCH \
                --form-string "payload_json=$payload" \
                -F "file=@${DEPLOY_LOG};filename=deploy-${ENVIRONMENT}-${DEPLOY_SHORT_HASH}.txt" \
                "${DISCORD_WEBHOOK}/messages/${DEPLOY_MSG_ID}" > /dev/null && edited=true
        fi
        # Fallback: JSON-only PATCH (no log attachment) so embed color always updates.
        if [ "$edited" = false ]; then
            curl_retry -X PATCH -H "Content-Type: application/json" \
                -d "$payload" "${DISCORD_WEBHOOK}/messages/${DEPLOY_MSG_ID}" > /dev/null || \
                log "WARNING: Failed to edit Discord webhook message after retries."
        fi
    else
        if [ -f "$DEPLOY_LOG" ]; then
            curl_retry \
                --form-string "payload_json=$payload" \
                -F "file=@${DEPLOY_LOG};filename=deploy-${ENVIRONMENT}-${DEPLOY_SHORT_HASH}.txt" \
                "$DISCORD_WEBHOOK" > /dev/null || \
                log "WARNING: Failed to send Discord webhook notification after retries."
        else
            curl_retry -H "Content-Type: application/json" \
                -d "$payload" "$DISCORD_WEBHOOK" > /dev/null || \
                log "WARNING: Failed to send Discord webhook notification after retries."
        fi
    fi
}

# ── Helper: docker compose with project config ──────────────────────────────
dc() {
    "$DOCKER_BIN" compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" "$@"
}

# ── Helper: prune stale SHA-tagged rollback images ──────────────────────────
# Each deploy tags ${IMAGE_NAME}:${GIT_SHA} for instant rollback. These images
# are large (full node_modules + .output + Chromium, multiple GB each) and
# `docker image prune` never touches them because they're tagged. Keep the 2
# newest (current + one rollback target), remove the rest — the older SHAs are
# almost never used and are the single biggest avoidable disk cost.
# Optional arg: how many newest SHA tags to keep (default 2). Under disk
# pressure we call it with 1 to reclaim a rollback image's GBs BEFORE resorting
# to a full build-cache wipe that would evict the warm pnpm-store/.vinxi mounts.
prune_rollback_images() {
    # Default keep=1 (one rollback target per image). These images are LARGE
    # (this monorepo's node_modules + ~1.5GB .output + Chromium on the full image),
    # and on the small root disk each retained SHA is several GB of unique layers.
    # Keeping 1 instead of 2 frees a full image set and is the cheapest way to stop
    # the disk-pressure cache wipes. Callers pass an explicit count to override.
    local keep="${1:-1}"
    # Both the slim (${IMAGE_NAME}) and full (${FULL_IMAGE_NAME}) images are
    # SHA-tagged each deploy; trim each repo to its N newest tags. They share
    # most layers on disk, so this is mostly about untagging — but untagged old
    # SHAs are what let `image prune` reclaim the unique layers underneath.
    local img
    for img in "${IMAGE_NAME}" "${FULL_IMAGE_NAME:-${IMAGE_NAME}-full}"; do
        "$DOCKER_BIN" images "${img}" --format '{{.Tag}} {{.CreatedAt}}' 2>/dev/null | \
            grep -v 'latest' | sort -k2 -r | tail -n +$((keep + 1)) | awk -v img="$img" '{print img ":" $1}' | \
            xargs -r "$DOCKER_BIN" rmi 2>/dev/null || true
    done
}

# ── Helper: reclaim disk in tiers ───────────────────────────────────────────
# The host no longer builds (images are pulled from GHCR), so nothing here is
# needed for the next deploy except the running containers and one rollback image.
#   gentle — stopped containers, dangling images, BuildKit cache older than
#            DEPLOY_BUILD_CACHE_KEEP_HOURS (default 72). Always safe, runs every deploy.
#   hard [target_gb] — escalates one step at a time and STOPS as soon as free space
#            reaches target_gb: all BuildKit cache, then rollback trimmed to 1, and
#            only last every unused image — which also removes the :rollback image
#            the post-deploy rollback depends on, so it is the last resort.
# The BuildKit cache is the one thing no deploy step ever cleaned: it was left by
# the old build-on-host era and sat at 11.6 GB on a 45 GB disk.
reclaim_disk() {
    local tier="${1:-gentle}" target="${2:-0}"
    "$DOCKER_BIN" container prune -f > /dev/null 2>&1 || true
    "$DOCKER_BIN" image prune -f > /dev/null 2>&1 || true
    if [ "$tier" = hard ]; then
        "$DOCKER_BIN" builder prune -af > /dev/null 2>&1 || true
        [ "$target" -gt 0 ] && [ "$(free_disk_gb)" -ge "$target" ] && return 0
        prune_rollback_images 1
        [ "$target" -gt 0 ] && [ "$(free_disk_gb)" -ge "$target" ] && return 0
        "$DOCKER_BIN" image prune -af > /dev/null 2>&1 || true
    else
        "$DOCKER_BIN" builder prune -f --filter "until=${DEPLOY_BUILD_CACHE_KEEP_HOURS:-72}h" > /dev/null 2>&1 || true
        prune_rollback_images
    fi
    return 0
}

# ── Helper: free space (whole GB) on the filesystem backing Docker's data dir ─
# Falls back to / if the Docker root can't be determined.
free_disk_gb() {
    local root
    root=$("$DOCKER_BIN" info --format '{{.DockerRootDir}}' 2>/dev/null)
    [ -d "$root" ] || root="/"
    df -BG --output=avail "$root" 2>/dev/null | tail -1 | tr -dc '0-9' || echo 0
}

# ── Helper: total size (whole GB) of the filesystem backing Docker's data dir ─
# Used to self-calibrate the build-cache caps to the actual disk so they never
# exceed available space (the headroom guarantee). Falls back to / .
total_disk_gb() {
    local root
    root=$("$DOCKER_BIN" info --format '{{.DockerRootDir}}' 2>/dev/null)
    [ -d "$root" ] || root="/"
    df -BG --output=size "$root" 2>/dev/null | tail -1 | tr -dc '0-9' || echo 0
}

cleanup() {
    local rc=$?
    if [ "$rc" -ne 0 ] && [ "$DEPLOY_REPORTED" = 0 ]; then release_event fail || true; fi
    if [ -n "${BG_HEALTH_PID:-}" ]; then kill "$BG_HEALTH_PID" 2>/dev/null || true; wait "$BG_HEALTH_PID" 2>/dev/null || true; fi
    [ -z "${HEALTH_RESULT_FILE:-}" ] || rm -f "$HEALTH_RESULT_FILE" "${HEALTH_RESULT_FILE}.workers"
    # A deploy that announced itself but exits without a final status (an
    # unexpected `set -e` failure, a kill) would otherwise sit at "deploying"
    # forever with nobody told.
    if [ "$DEPLOY_IN_PROGRESS" = 1 ] && [ "$DEPLOY_REPORTED" = 0 ] && [ -f "${REPO_DIR}/deploy/oncall-send.sh" ]; then
        bash "${REPO_DIR}/deploy/oncall-send.sh" alert firing D04 2 "Deploy died without reporting a result" \
            "Commit ${DEPLOY_SHORT_HASH:-unknown} on ${ENVIRONMENT}: deploy.sh exited $rc before a final status. Check webhook.log." || true
    fi
    rm -f "$DEPLOY_LOG"
}
trap cleanup EXIT

# ── Helper: time a step and log duration ─────────────────────────────────────
step_start() {
    STEP_START_TIME=$(date +%s)
    log "$1"
}

step_done() {
    local elapsed=$(( $(date +%s) - STEP_START_TIME ))
    log "  └─ done in ${elapsed}s"
}

# ── Discord pipeline checklist ──────────────────────────────────────────────
# The deploy's Discord embed carries a live checklist of these stages, edited in
# place as each one starts (`stage <key>`), so the channel shows WHERE a deploy
# is — not just "deploying…" for six minutes. Coarser than step_start on
# purpose: these are the phases a human cares about. `stage_note` adds detail to
# the current line (the bake countdown, a rollback reason). Progress edits are
# ONE short best-effort request each — never curl_retry — so a slow or down
# Discord can't stretch a deploy; the final update_deploy_status keeps retries.
STAGE_KEYS=(fetch pull migrate services swap bake health)
STAGE_LABELS=("Fetch code" "Pull images" "Migrate database" "Start services" "Swap web (blue/green)" "Smoke test + bake" "Health checks")
STAGE_CUR=-1
STAGE_T0=0
STAGE_DUR=()
STAGE_NOTE=""
# Progress edits wait until send_deploy_started has announced THIS commit — the
# fetch stage runs before the reset, when HEAD is still the previous release.
DEPLOY_ANNOUNCED=0

fmt_dur() {
    if [ "$1" -ge 60 ]; then printf '%dm %02ds' $(($1 / 60)) $(($1 % 60)); else printf '%ds' "$1"; fi
}

# stage_fields_json <running|success|fail|rolledback> — the embed's Pipeline field.
stage_fields_json() {
    local state="$1" i icon line lines="" now
    now=$(date +%s)
    for i in "${!STAGE_KEYS[@]}"; do
        if [ "$STAGE_CUR" -lt 0 ] || [ "$i" -gt "$STAGE_CUR" ]; then
            line="⬜ ${STAGE_LABELS[$i]}"
        elif [ "$i" -lt "$STAGE_CUR" ]; then
            line="✅ ${STAGE_LABELS[$i]} · $(fmt_dur "${STAGE_DUR[$i]:-0}")"
        else
            case "$state" in
                success) icon="✅" ;; fail) icon="❌" ;; rolledback) icon="↩️" ;; *) icon="🔄" ;;
            esac
            line="${icon} ${STAGE_LABELS[$i]}"
            [ "$state" != "running" ] && line="${line} · $(fmt_dur $((now - STAGE_T0)))"
            [ -n "$STAGE_NOTE" ] && line="${line} · ${STAGE_NOTE}"
        fi
        lines="${lines}${lines:+\\n}${line}"
    done
    printf '[{"name":"Pipeline","value":"%s"}]' "$lines"
}

discord_progress() {
    [ -n "$DISCORD_WEBHOOK" ] && [ -n "$DEPLOY_MSG_ID" ] && [ "$DEPLOY_ANNOUNCED" = 1 ] || return 0
    [ "$STAGE_CUR" -ge 0 ] || return 0
    local env_label payload
    env_label=$(echo "$ENVIRONMENT" | tr '[:lower:]' '[:upper:]')
    payload=$(printf '{"embeds":[{"title":"%s","description":"%s","color":%d,"fields":%s,"footer":{"text":"%s · elapsed %s"}}]}' \
        "[$env_label] Commit $DEPLOY_SHORT_HASH - deploying · $((STAGE_CUR + 1))/${#STAGE_KEYS[@]} ${STAGE_LABELS[$STAGE_CUR]}" \
        "$DEPLOY_COMMIT_MSG" 10181046 "$(stage_fields_json running)" "$DEPLOY_AUTHOR" \
        "$(fmt_dur $(( $(date +%s) - DEPLOY_START_TIME )))")
    curl -s -o /dev/null --max-time 5 -X PATCH -H "Content-Type: application/json" \
        -d "$payload" "${DISCORD_WEBHOOK}/messages/${DEPLOY_MSG_ID}" 2>/dev/null || true
}

stage() {
    release_event "$1"
    local i now
    now=$(date +%s)
    for i in "${!STAGE_KEYS[@]}"; do
        [ "${STAGE_KEYS[$i]}" = "$1" ] || continue
        [ "$STAGE_CUR" -ge 0 ] && STAGE_DUR[STAGE_CUR]=$((now - STAGE_T0))
        STAGE_CUR=$i
        STAGE_T0=$now
        STAGE_NOTE=""
        discord_progress
        return 0
    done
}

# Stripped of JSON metacharacters: the note is spliced into the payload raw.
stage_note() {
    STAGE_NOTE=$(printf '%s' "$1" | tr -d '"\\')
    discord_progress
}

# ── Helper: wait for a service port to be published on the host ──────────────
# All four probed services publish on 127.0.0.1 (docker-compose.yml), so a
# listening socket is the signal. Two things this has to get right:
#
#  1. `count=$((count + 1))`, NEVER `(( count++ ))`. This script runs under
#     `set -e`, and an arithmetic COMMAND whose expression evaluates to 0
#     returns exit status 1 — which is exactly what a post-increment returns on
#     the FIRST pass, since count starts at 0. That killed the backgrounded
#     subshell about one second in, so the nominal 30s budget was really a
#     single probe and the diagnostic below was unreachable. Any service that
#     took a moment to (re)publish its port after `compose up` — or that blipped
#     while restarting — then failed the deploy here at Step 5, i.e. AFTER Step
#     4b had already hotswapped Apache onto the new web container: the release
#     had visibly shipped and the deploy still reported "port health check
#     failed" (and skipped the prune/cache-rule steps below). An assignment
#     always returns 0, so the loop now spends its full budget.
#  2. `ss` (iproute2) is not guaranteed to be on PATH. Without a fallback its
#     absence makes every probe silently never match — the same false failure,
#     with the retries doing nothing to help. bash's /dev/tcp connect is a
#     builtin and needs no package.
#
# The budget only costs wall-clock on a genuine failure (a healthy port returns
# on the first probe) and runs inside the supervisor gate's parallel 120s, so it
# is free to be generous here. Override with PORT_HEALTH_TIMEOUT if needed.
check_port() {
    local port=$1 count=0 max_retries="${PORT_HEALTH_TIMEOUT:-60}" probe=ss
    command -v ss >/dev/null 2>&1 || probe=connect
    while [ "$count" -lt "$max_retries" ]; do
        if [ "$probe" = ss ]; then
            if ss -tuln 2>/dev/null | grep -qE "[:.]${port}\b"; then
                return 0
            fi
        elif (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done
    log "ERROR: Port $port did not come up after ${max_retries}s (probe: ${probe})."
    return 1
}

# ── Main deploy ─────────────────────────────────────────────────────────────

cd "$REPO_DIR" || { echo "FATAL: Cannot cd to $REPO_DIR"; exit 1; }

# Acquire deploy lock via flock (fd 200) — per-environment lock
if ! touch "$LOCKFILE" 2>/dev/null; then
    log "FATAL: Cannot create lockfile $LOCKFILE"
    exit 1
fi
exec 200>>"$LOCKFILE"

release_event queued
if ! flock -n 200; then
    # Another deploy is running — signal for redeploy with our PID
    log "Deploy already in progress. Queuing for redeploy after current deploy finishes."
    printf '%s\n' "$$" > "${QUEUE_FILE}.$$" && mv -f "${QUEUE_FILE}.$$" "$QUEUE_FILE"

    # Block until the running deploy releases the lock. A healthy deploy holds it
    # for ~10-15 min; bound the wait so a wedged holder fails this release loudly
    # (the exit trap reports it) instead of leaving it "queued" forever.
    if ! flock -w "${DEPLOY_LOCK_WAIT_SECONDS:-2700}" 200; then
        log "FATAL: Failed to acquire deploy lock within ${DEPLOY_LOCK_WAIT_SECONDS:-2700}s — another deploy is wedged (see 'fuser $LOCKFILE')."
        rm -f "${QUEUE_FILE}.$$"
        exit 1
    fi

    # Check if we're still the most recent queued instance
    queued_pid=$(cat "$QUEUE_FILE" 2>/dev/null)
    if [ "$queued_pid" != "$$" ]; then
        release_event superseded
        log "Superseded by a newer deploy request. Exiting."
        exit 0
    fi

    # We're the latest — clear queue and proceed
    rm -f "$QUEUE_FILE"
    log "=== Queued deploy now executing ==="
fi

release_event lock-acquired
if [ -n "${DEPLOY_EXPECT_LIVE_ID:-}" ]; then
    current_live=$(node "$REPO_DIR/deploy/release-state.mjs" read "$DEPLOY_STATE_DIR" live id)
    [ "$current_live" = "$DEPLOY_EXPECT_LIVE_ID" ] || { release_event superseded; log "A newer release is serving; refusing stale rollback."; exit 0; }
fi
log "=== Deploy triggered ($ENVIRONMENT, branch=$BRANCH, release=$DEPLOY_RELEASE_ID) ==="
DEPLOY_START_TIME=$(date +%s)

# Capture all deploy output to log file.
# IMPORTANT: close fd 200 (flock) inside the process substitution so the tee
# subprocess does not inherit the deploy lock. Without this, a self-restart
# via exec leaves the orphaned tee holding the flock, deadlocking the new process.
# Guard: only set up tee once — skip on self-restart to avoid doubled output.
if [ -z "${DEPLOY_SELF_RESTARTED:-}" ]; then
    exec > >(exec 200>&-; tee -a "$DEPLOY_LOG") 2>&1
fi

# ── Step 1: Pull latest code ────────────────────────────────────────────────
stage fetch
step_start "Fetching latest code..."

# The release live before this deploy — the post-deploy guard's rollback
# target. Exported so the self-restart below (HEAD already moved) keeps it.
export PREV_DEPLOYED_SHA="${PREV_DEPLOYED_SHA:-$(node "$REPO_DIR/deploy/release-state.mjs" read "$DEPLOY_STATE_DIR" last-successful sha)}"
export PREV_RELEASE_ID="${PREV_RELEASE_ID:-$(node "$REPO_DIR/deploy/release-state.mjs" read "$DEPLOY_STATE_DIR" live id)}"
export PREV_WEB_REF="${PREV_WEB_REF:-$(node "$REPO_DIR/deploy/release-state.mjs" read "$DEPLOY_STATE_DIR" last-successful webDigest)}"
export PREV_FULL_REF="${PREV_FULL_REF:-$(node "$REPO_DIR/deploy/release-state.mjs" read "$DEPLOY_STATE_DIR" last-successful fullDigest)}"

# Snapshot deploy.sh hash before pulling so we can detect self-updates.
DEPLOY_SCRIPT_PATH="${REPO_DIR}/deploy.sh"
PRE_PULL_HASH=$(sha256sum "$DEPLOY_SCRIPT_PATH" | awk '{print $1}')

"$GIT_BIN" fetch "$REMOTE_REPO" "$BRANCH" || {
    log "ERROR: git fetch failed."
    update_deploy_status fail "git fetch failed"
    exit 1
}

"$GIT_BIN" checkout "$BRANCH" 2>/dev/null || "$GIT_BIN" checkout -b "$BRANCH" "$REMOTE_REPO/$BRANCH"

# Never roll production back because a webhook arrived late. GitHub does not
# deliver push events in order: on 2026-10-21 #914's run started 23 minutes after
# its merge, AFTER #915's had deployed, and the flock below only serialises
# deploys — so the older SHA went out last and silently reverted #915. HEAD here
# is the commit the last deploy reset to. If the requested SHA is a strict
# ancestor of it, it is already contained in what is live: skip. An intentional
# rollback sets ALLOW_OLDER_DEPLOY=1.
if [ -n "$DEPLOY_TARGET_SHA" ] && [ "${ALLOW_OLDER_DEPLOY:-0}" != "1" ]; then
    LIVE_SHA=$(node "$REPO_DIR/deploy/release-state.mjs" read "$DEPLOY_STATE_DIR" live sha)
    TARGET_FULL_SHA=$("$GIT_BIN" rev-parse --verify --quiet "${DEPLOY_TARGET_SHA}^{commit}" 2>/dev/null || true)
    if [ -n "$LIVE_SHA" ] && [ -n "$TARGET_FULL_SHA" ] && [ "$TARGET_FULL_SHA" != "$LIVE_SHA" ] \
        && "$GIT_BIN" merge-base --is-ancestor "$TARGET_FULL_SHA" "$LIVE_SHA" 2>/dev/null; then
        log "Requested ${TARGET_FULL_SHA:0:12} is OLDER than the live ${LIVE_SHA:0:12} (an ancestor of it) — skipping so a late webhook cannot roll production back."
        log "  For an intentional rollback re-run with ALLOW_OLDER_DEPLOY=1."
        # No GitHub status: set_github_status posts to HEAD, which is the LIVE
        # commit, and would overwrite its real deploy result.
        exit 0
    fi
fi

# Deploy target: the exact commit CI built + pushed to GHCR (passed as $2), so
# the checked-out code and the pulled image are the same SHA even if
# origin/$BRANCH has already advanced past it. Falls back to the branch tip for
# manual runs (`./deploy.sh production`) that pass no SHA, or if the requested
# SHA somehow isn't reachable after the fetch.
RESET_TARGET="$REMOTE_REPO/$BRANCH"
if [ -n "$DEPLOY_TARGET_SHA" ]; then
    if "$GIT_BIN" cat-file -e "${DEPLOY_TARGET_SHA}^{commit}" 2>/dev/null; then
        RESET_TARGET="$DEPLOY_TARGET_SHA"
    else
        "$GIT_BIN" fetch "$REMOTE_REPO" "$DEPLOY_TARGET_SHA" || { release_event fail; log "Cannot fetch the approved SHA; refusing branch-tip fallback."; exit 1; }
        "$GIT_BIN" cat-file -e "${DEPLOY_TARGET_SHA}^{commit}" || exit 1
        RESET_TARGET="$DEPLOY_TARGET_SHA"
    fi
fi
"$GIT_BIN" reset --hard "$RESET_TARGET" || {
    log "ERROR: git reset failed."
    update_deploy_status fail "git reset failed"
    exit 1
}
step_done

# ── Self-restart if deploy.sh was updated ────────────────────────────────────
# Compare the hash of deploy.sh after the pull. If it changed, exec the new
# version so the rest of the deploy runs with the updated logic. The env var
# DEPLOY_SELF_RESTARTED prevents infinite re-exec loops.
POST_PULL_HASH=$(sha256sum "$DEPLOY_SCRIPT_PATH" | awk '{print $1}')
if [ "$PRE_PULL_HASH" != "$POST_PULL_HASH" ] && [ -z "${DEPLOY_SELF_RESTARTED:-}" ]; then
    log "deploy.sh was updated during pull — restarting with the new version."
    # Release the deploy lock before re-exec so the new process can acquire it.
    # (The tee fd 200 fix above handles normal runs, but this is belt-and-suspenders.)
    exec 200>&-
    export DEPLOY_SELF_RESTARTED=1
    exec bash "$DEPLOY_SCRIPT_PATH" "$ENVIRONMENT" "$DEPLOY_TARGET_SHA"
fi

# ── Step 1c: (removed) Apache CDN asset permissions ──────────────────────────
# Heavy static assets (/library, /music, /models, /sprites) used to be served
# off disk by Apache, which needed world-read perms re-asserted every deploy.
# They now live in Cloudflare R2 and are synced below (see "Sync static assets
# to R2"), so Apache no longer touches them and no chmod dance is needed.

IMAGE_NAME="${PROJECT_NAME}-app"
# Full image (Go supervisor/status: + Go bins, Chromium, git). Built from the
# same Dockerfile as the slim web image, target runner-full. Must match the
# `image:` for the supervisor/status services in docker-compose.yml.
FULL_IMAGE_NAME="${IMAGE_NAME}-full"
GIT_SHA=$("$GIT_BIN" rev-parse --short HEAD 2>/dev/null || echo "unknown")
# Full (untruncated) commit SHA — the immutable tag CI pushes to GHCR. After the
# reset above, HEAD is exactly the deploy target, so this is the tag to pull.
GIT_SHA_FULL=$("$GIT_BIN" rev-parse HEAD 2>/dev/null || echo "")

release_event fetched
send_deploy_started
DEPLOY_IN_PROGRESS=1  # from here on, exiting without update_deploy_status is a D04 (cleanup)

# ── Step 1b: Pre-pull cleanup ─────────────────────────────────────────────────
# The heavy build now runs in GitHub Actions, so the old BuildKit-cache headroom
# math is gone. We just need room for the incoming image layers: prune dangling
# containers/images + stale SHA-tagged rollback images, then confirm there's
# enough free space to pull. Thresholds are env-overridable.
#   DEPLOY_HEADROOM_GB     — free space the deploy must always leave (default 2)
#   DEPLOY_PULL_RESERVE_GB — transient space the incoming image layers need (default 6)
stage pull
step_start "Pre-pull disk cleanup..."
reclaim_disk gentle

DEPLOY_HEADROOM_GB="${DEPLOY_HEADROOM_GB:-2}"
DEPLOY_PULL_RESERVE_GB="${DEPLOY_PULL_RESERVE_GB:-6}"
DISK_TOTAL_GB=$(total_disk_gb)
NEED_FREE_GB=$(( DEPLOY_HEADROOM_GB + DEPLOY_PULL_RESERVE_GB ))
DISK_FREE_GB=$(free_disk_gb)
log "Disk: ${DISK_FREE_GB}G free of ${DISK_TOTAL_GB}G (need ≥ ${NEED_FREE_GB}G to pull and keep ${DEPLOY_HEADROOM_GB}G headroom)."
if [ "${DISK_FREE_GB:-0}" -lt "$NEED_FREE_GB" ]; then
    log "Low disk — reclaiming BuildKit cache, then rollback images, then unused images, until ${NEED_FREE_GB}G is free."
    reclaim_disk hard "$NEED_FREE_GB"
    DISK_FREE_GB=$(free_disk_gb)
    # Fail closed on the full requirement, not just the headroom: pulling into less
    # than the incoming layers need fills the disk MID-pull, which takes down
    # Postgres and every container's writable layer with it (2026-10-25).
    if [ "${DISK_FREE_GB:-0}" -lt "$NEED_FREE_GB" ]; then
        log "ERROR: only ${DISK_FREE_GB}G free after reclaiming — need ≥ ${NEED_FREE_GB}G to pull safely. Refusing; nothing was changed."
        log "  Find the space: bash deploy/disk-report.sh; sudo du -xh / --max-depth=2 | sort -h | tail -25"
        update_deploy_status fail "insufficient disk to pull safely"
        exit 1
    fi
    log "After reclaim: ${DISK_FREE_GB}G free."
else
    log "Disk healthy."
fi
step_done

# NOTE: the old "Step 1e: generate library covers" ran here. The static library
# (bundled public/library/*.pdf → data/library-metadata.json) has been fully
# retired — the catalogue JSON is empty, the bundled PDFs were removed from the
# repo, and lib/library.server.ts now reads LibraryDocument rows (DB) with covers
# in R2 (coverKey → asset()). So there is nothing to render on the host and the
# step was a no-op; it's removed.

# (R2 static asset sync runs post-pull as Step 2a, using the freshly pulled
#  image — see below.)

# ── Step 2: Pull pre-built images from GHCR ──────────────────────────────────
# The two images (slim web → runner, full supervisor/status → runner-full) are
# built + pushed by .github/workflows/deploy.yml on GitHub's native ARM64
# runners, each tagged with the full commit SHA. We pull THIS deploy's SHA and
# retag it to the local names docker-compose.yml expects (${IMAGE_NAME}:latest /
# ${FULL_IMAGE_NAME}:latest), so the compose file and the blue/green hotswap need
# no changes. This replaces the old on-host `vite build` entirely — no BuildKit,
# no cache mounts, no build-disk gymnastics.
step_start "Pulling images from GHCR (${GHCR_IMAGE}:${GIT_SHA_FULL})..."

if [ -z "$GIT_SHA_FULL" ]; then
    log "ERROR: could not determine the commit SHA to pull."
    update_deploy_status fail "no image tag to pull"
    exit 1
fi

# Authenticate to GHCR when a token is available. If the packages are public the
# pull succeeds without a login, so a missing/failed login is only a warning — we
# still attempt the (possibly anonymous) pull and let it be the hard gate.
if [ -n "$GHCR_TOKEN" ]; then
    if ! printf '%s' "$GHCR_TOKEN" | "$DOCKER_BIN" login "$GHCR_REGISTRY" -u "$GHCR_USER" --password-stdin > /dev/null 2>&1; then
        log "WARNING: docker login to ${GHCR_REGISTRY} failed — attempting an unauthenticated pull (works only if the package is public)."
    fi
else
    log "No GHCR_TOKEN/GITHUB_TOKEN set — attempting an unauthenticated pull (works only if the package is public)."
fi

# Pull both images CONCURRENTLY. They are separate repos but share most base
# layers; the full image's unique layers (Chromium ~300 MB, Go bins) can transfer
# while the web image's layers extract, instead of strictly after. Docker's
# per-layer locking makes shared-layer pulls safe to overlap. Each pull's log is
# captured to its own file so a failure still reports WHICH image and why, exactly
# as the old serial version did.
WEB_PULL_REF="${GHCR_IMAGE}:${GIT_SHA_FULL}"
FULL_PULL_REF="${GHCR_IMAGE_FULL}:${GIT_SHA_FULL}"
if [ -n "${RELEASE_EXPECT_WEB_DIGEST:-}" ] || [ -n "${RELEASE_EXPECT_FULL_DIGEST:-}" ]; then
    [[ "$RELEASE_EXPECT_WEB_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 1
    [[ "$RELEASE_EXPECT_FULL_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 1
    WEB_PULL_REF="${GHCR_IMAGE}@${RELEASE_EXPECT_WEB_DIGEST}"
    FULL_PULL_REF="${GHCR_IMAGE_FULL}@${RELEASE_EXPECT_FULL_DIGEST}"
fi
# Sets web_pull_ok / full_pull_ok (0 = pulled) and PULL_NO_SPACE (1 = a pull died
# because the disk filled, which reclaiming space can fix; anything else cannot).
pull_images() {
    local web_log full_log
    web_log=$(mktemp /tmp/pull-web.XXXXXX)
    full_log=$(mktemp /tmp/pull-full.XXXXXX)
    "$DOCKER_BIN" pull "$WEB_PULL_REF"  > "$web_log" 2>&1 & local pull_web=$!
    "$DOCKER_BIN" pull "$FULL_PULL_REF" > "$full_log" 2>&1 & local pull_full=$!
    web_pull_ok=0; full_pull_ok=0; PULL_NO_SPACE=0
    wait "$pull_web"  || web_pull_ok=1
    wait "$pull_full" || full_pull_ok=1
    cat "$web_log" "$full_log"
    if [ "$web_pull_ok" -ne 0 ] || [ "$full_pull_ok" -ne 0 ]; then
        if grep -qi 'no space left' "$web_log" "$full_log" 2>/dev/null; then PULL_NO_SPACE=1; fi
    fi
    rm -f "$web_log" "$full_log"
}
pull_images
# The up-front check estimates what a pull needs; layers can still outgrow it. A pull
# that dies on "no space left" is retried ONCE after reclaiming everything not needed
# (layers already downloaded are kept, so the retry is cheap). Other failures are not.
if [ "$PULL_NO_SPACE" = 1 ]; then
    log "Pull ran out of disk (${DISK_FREE_GB:-?}G free beforehand) — reclaiming and retrying once..."
    reclaim_disk hard "${NEED_FREE_GB:-0}"
    log "$(free_disk_gb)G free after reclaim."
    pull_images
fi

if [ "$web_pull_ok" -ne 0 ]; then
    log "ERROR: failed to pull ${GHCR_IMAGE}:${GIT_SHA_FULL}."
    update_deploy_status fail "image pull failed (web)"
    exit 1
fi
if [ "$full_pull_ok" -ne 0 ]; then
    log "ERROR: failed to pull ${GHCR_IMAGE_FULL}:${GIT_SHA_FULL}."
    update_deploy_status fail "image pull failed (full)"
    exit 1
fi

"$DOCKER_BIN" tag "$WEB_PULL_REF" "${GHCR_IMAGE}:${GIT_SHA_FULL}"
"$DOCKER_BIN" tag "$FULL_PULL_REF" "${GHCR_IMAGE_FULL}:${GIT_SHA_FULL}"
export RELEASE_WEB_DIGEST=$("$DOCKER_BIN" image inspect -f '{{index .RepoDigests 0}}' "$WEB_PULL_REF")
export RELEASE_FULL_DIGEST=$("$DOCKER_BIN" image inspect -f '{{index .RepoDigests 0}}' "$FULL_PULL_REF")
export RELEASE_CONFIG_HASH=$("$DOCKER_BIN" image inspect -f '{{index .Config.Labels "io.rmh.public-config-hash"}}' "$WEB_PULL_REF")
release_event pulled

# Before :latest moves, keep what it pointed at as :rollback — the release the
# non-web services are restored to if they fail their health checks after
# `compose up` (rollback_non_web below). Absent on a first deploy: no rollback.
for img in "$IMAGE_NAME" "$FULL_IMAGE_NAME"; do
    if "$DOCKER_BIN" image inspect "${img}:latest" >/dev/null 2>&1; then
        "$DOCKER_BIN" tag "${img}:latest" "${img}:rollback" || true
    fi
done

# Retag the pulled images to the local names docker-compose.yml references — both
# :latest (the compose `image:`) and :${GIT_SHA} (instant rollback target).
# Layers are shared, so the extra tags cost almost no disk.
"$DOCKER_BIN" tag "${GHCR_IMAGE}:${GIT_SHA_FULL}"      "${IMAGE_NAME}:latest"
"$DOCKER_BIN" tag "${GHCR_IMAGE}:${GIT_SHA_FULL}"      "${IMAGE_NAME}:${GIT_SHA}"
"$DOCKER_BIN" tag "${GHCR_IMAGE_FULL}:${GIT_SHA_FULL}" "${FULL_IMAGE_NAME}:latest"
"$DOCKER_BIN" tag "${GHCR_IMAGE_FULL}:${GIT_SHA_FULL}" "${FULL_IMAGE_NAME}:${GIT_SHA}"
step_done

# ── Step 2a: Publish immutable candidate assets while migrations run ────────
# Required uploads finish before service replacement or traffic flip. Older
# namespaces are retained for existing tabs and rollback images.
BG_R2_PID=""
BG_AVATAR_PID=""
BG_MEDIA_PID=""
if grep -qE '^VITE_CDN_BASE_URL=.+' "$ENV_FILE" 2>/dev/null; then
    STATIC_ASSET_VERSIONS=$("$DOCKER_BIN" image inspect -f '{{index .Config.Labels "io.rmh.static-asset-versions"}}' "${IMAGE_NAME}:latest")
    [ "$STATIC_ASSET_VERSIONS" != '<no value>' ] || STATIC_ASSET_VERSIONS=''
    log "Publishing candidate static assets to R2 (overlaps migrations)..."
    (
        exec 200>&-
        timeout "${ASSET_PUBLISH_TIMEOUT_SECONDS:-600}" "$DOCKER_BIN" run --rm \
            -e "STATIC_ASSET_VERSIONS=$STATIC_ASSET_VERSIONS" \
            --env-file "$ENV_FILE" \
            -e PUBLIC_DIR=/app/public \
            -v "${REPO_DIR}/public:/app/public:ro" \
            --entrypoint node \
            "${IMAGE_NAME}:latest" \
            scripts/sync-static-assets-to-r2.mjs \
            && log "R2 static asset sync complete." \
            || { log "ERROR: candidate assets could not be published."; exit 1; }
    ) &
    BG_R2_PID=$!
else
    log "VITE_CDN_BASE_URL not set — skipping R2 static asset sync (assets served from origin/public)."
fi

# ── Step 2b (staging only): Connect DBLab clone to compose network ───────────
# The DBLab thin-clone container ("staging") runs on its own network. The
# compose services live on ${PROJECT_NAME}_default. Bridge them so the app
# can reach the DB by container name. Idempotent — a no-op if already connected.
if [ "$ENVIRONMENT" = "staging" ]; then
    step_start "Ensuring staging DB is on compose network..."

    # Verify the staging DB container exists and is running
    if ! "$DOCKER_BIN" inspect --format='{{.State.Running}}' staging 2>/dev/null | grep -q true; then
        log "ERROR: 'staging' container is not running."
        log "  Current state: $("$DOCKER_BIN" inspect --format='{{.State.Status}}' staging 2>/dev/null || echo 'not found')"
        update_deploy_status fail "staging DB container not running"
        exit 1
    fi

    COMPOSE_NETWORK="${PROJECT_NAME}_default"
    "$DOCKER_BIN" network create "$COMPOSE_NETWORK" 2>/dev/null || true

    if ! "$DOCKER_BIN" network connect "$COMPOSE_NETWORK" staging 2>/dev/null; then
        # Already connected is fine — verify it's actually on the network
        if ! "$DOCKER_BIN" inspect --format='{{json .NetworkSettings.Networks}}' staging 2>/dev/null | grep -q "$COMPOSE_NETWORK"; then
            log "ERROR: Failed to connect 'staging' container to network '$COMPOSE_NETWORK'."
            update_deploy_status fail "DB network connect failed"
            exit 1
        fi
    fi

    # Verify DNS resolution: the web container must be able to resolve the DB hostname
    DB_HOST=$(grep -oP '(?<=@)[^:/@]+(?=[:\/])' "$ENV_FILE" | head -1)
    if [ -n "$DB_HOST" ] && [ "$DB_HOST" != "localhost" ] && [ "$DB_HOST" != "127.0.0.1" ]; then
        log "  DB host from $ENV_FILE: $DB_HOST"
    elif [ -n "$DB_HOST" ]; then
        log "WARNING: DATABASE_URL uses '$DB_HOST' — this won't work between containers."
        log "  Change it to the DB container name (e.g., 'staging') in $ENV_FILE."
    fi

    step_done
fi

# ── Step 3: Run database migrations ───────────────────────────────────────────
stage migrate
step_start "Running database migrations..."

# Extract DB host and port from DATABASE_URL for diagnostics
DB_HOST=$(grep -oP '(?<=@)[^:/@]+(?=[:\/])' "$ENV_FILE" | head -1)
DB_PORT=$(grep -oP '(?<=@)[^/]+' "$ENV_FILE" | head -1 | grep -oP ':\K[0-9]+')
DB_PORT="${DB_PORT:-5432}"

# Wait for database to be reachable before running migrations.
# NOTE: `prisma migrate status` exits non-zero for BOTH connection failures AND
# failed/pending migrations. We distinguish by checking the output — if Prisma
# can talk to the DB (even to report a failed migration), connectivity is fine.
MIGRATION_RETRIES=10
MIGRATION_DELAY=5
for i in $(seq 1 $MIGRATION_RETRIES); do
    # Disable set -e: prisma migrate status exits non-zero for both connection
    # failures AND pending/failed migrations. We need to inspect the output to
    # tell them apart, so we must capture the exit code manually.
    set +e
    MIGRATE_OUTPUT=$(dc run --rm --no-deps web sh -c 'node node_modules/prisma/build/index.js migrate status 2>&1')
    MIGRATE_EXIT=$?
    set -e

    # Success, or non-zero but Prisma DID reach the DB (it reports migration state)
    if [ $MIGRATE_EXIT -eq 0 ] || echo "$MIGRATE_OUTPUT" | grep -qE 'migration|Database schema'; then
        log "Database is reachable."
        break
    fi

    if [ "$i" -eq "$MIGRATION_RETRIES" ]; then
        PRISMA_ERR=$(echo "$MIGRATE_OUTPUT" | grep -v '^npm notice' | grep -v '^$' | tail -5)
        log "ERROR: Database not reachable after $MIGRATION_RETRIES attempts."
        log "  Prisma output:"
        echo "$PRISMA_ERR" | while IFS= read -r line; do log "    $line"; done
        log "  DB target: ${DB_HOST}:${DB_PORT}"
        update_deploy_status fail "database not reachable"
        exit 1
    fi
    log "Database not reachable yet, retrying in ${MIGRATION_DELAY}s... ($i/$MIGRATION_RETRIES)"
    sleep "$MIGRATION_DELAY"
done

# An up-to-date status avoids another Prisma container startup. Pending work
# runs migrate deploy; failed/partial migrations require deliberate recovery.
if [ "${MIGRATE_EXIT:-1}" -eq 0 ]; then
    log "  Schema already up to date — skipping migrate deploy (no pending migrations)."
else
    # Migration lock safety (audit §1.7). Without a lock_timeout, a migration's
    # ALTER/CREATE INDEX takes an ACCESS EXCLUSIVE lock and — if the table is
    # busy — can queue behind (and then block) ALL reads/writes on that table for
    # the migration's whole duration: an outage, not a blip, on a large table.
    # lock_timeout=5s makes a DDL that can't get its lock FAIL FAST (the deploy
    # then reports "database migration failed" and stops) instead of freezing the
    # table indefinitely; statement_timeout=0 leaves long-but-unblocked work (a
    # legit big backfill) alone. PGOPTIONS passes these as session GUCs to the
    # migrate connection; scoped to THIS container via `-e` so it never affects
    # the running app. (If a future Prisma engine ignores PGOPTIONS, the
    # equivalent is `?options=-c%20lock_timeout%3D5s` on the migrate DATABASE_URL.)
    run_migrate_container() {
        dc run --rm --no-deps \
            -e PGOPTIONS='-c lock_timeout=5s -c statement_timeout=0' \
            web sh -c "$1" 2>&1
    }

    # Preserve the complete failure output for the release log.
    set +e
    MIGRATE_DEPLOY_OUTPUT=$(run_migrate_container \
        'node node_modules/prisma/build/index.js migrate deploy')
    MIGRATE_DEPLOY_EXIT=$?
    set -e
    printf '%s\n' "$MIGRATE_DEPLOY_OUTPUT"

    # A failed migration can be partially applied. Never automatically mark it
    # rolled back or replay DDL based on error-message matching. Inspect its
    # state and reconcile it through the migration recovery runbook.
    if [ "$MIGRATE_DEPLOY_EXIT" -ne 0 ]; then
        log "ERROR: Database migration failed."
        update_deploy_status fail "database migration failed"
        exit 1
    fi
fi
step_done

# ── Step 3a: Backfill existing avatars to R2 (idempotent) ──────────────────
# New avatar uploads already go straight to R2 (the built app inlines the CDN
# base). This migrates any PRE-EXISTING avatars still on the local db/ volume into
# R2 (user-avatars/<file>) and rewrites UserProfile.customImage to the CDN URL, so
# db/avatars can later be reclaimed (scripts/reclaim-db.sh). Runs INSIDE the fresh
# image (node + prod deps + the self-contained script) with the host db/ volume
# bind-mounted. Idempotent: a no-op once everything is migrated (one DB query).
# Runs only after staging DB attachment and successful schema migrations.
# Compose supplies the web service network, host mappings and environment.
# Best-effort + CDN-gated, exactly like the R2 asset sync above.
if grep -qE '^VITE_CDN_BASE_URL=.+' "$ENV_FILE" 2>/dev/null; then
    # Resolve the host db/ volume the same way docker-compose does
    # (${STORAGE_PATH:-./db}, relative paths against the repo dir).
    STORAGE_PATH_HOST=$(grep -E '^STORAGE_PATH=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"'')
    [ -z "$STORAGE_PATH_HOST" ] && STORAGE_PATH_HOST="${REPO_DIR}/db"
    case "$STORAGE_PATH_HOST" in
        /*) ;;
        *) STORAGE_PATH_HOST="${REPO_DIR}/${STORAGE_PATH_HOST#./}" ;;
    esac
    if [ -d "$STORAGE_PATH_HOST/avatars" ]; then
        # Best-effort + idempotent (a no-op once migrated), and nothing between
        # here and Step 6 depends on it — so run it in the background exactly
        # like the R2 asset sync above instead of blocking the deploy on a
        # node+Prisma container boot. Joined at Step 6 before we report success.
        log "Backfilling existing avatars to R2 (idempotent, in background)..."
        (
            exec 200>&-
            timeout -k 30 "${BACKFILL_TIMEOUT_SECONDS:-600}" \
            "$DOCKER_BIN" compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" \
                -f docker-compose.yml -f deploy/docker-compose.backfill.yml run --rm --no-deps -T \
                -e STORAGE_PATH=/app/db \
                --entrypoint node \
                web \
                scripts/migrate-avatars-to-r2.ts \
                && log "Avatar R2 backfill complete." \
                || log "WARNING: avatar R2 backfill failed — existing avatars stay on the proxy path until the next run."
        ) &
        BG_AVATAR_PID=$!
    else
        log "No ${STORAGE_PATH_HOST}/avatars dir — skipping avatar backfill (nothing local to migrate)."
    fi

    # ── Step 3a.2: Backfill the remaining local media to R2 (idempotent) ─────
    # Slice It songs + covers (db/music) and curated build thumbnails
    # (db/builds) were written to the web container's own filesystem until
    # 2026-08-06. That is worse than untidy here: web runs blue/green, so a file
    # uploaded to one colour 404s from the other until the next deploy flips
    # back. New uploads already go straight to R2; this moves what predates them
    # and rewrites the Song rows. Same shape as the avatar backfill above —
    # best-effort, idempotent, backgrounded, joined at Step 6.
    if [ -d "$STORAGE_PATH_HOST/music" ] || [ -d "$STORAGE_PATH_HOST/builds" ]; then
        log "Backfilling local media (songs, covers, build thumbnails) to R2 (idempotent, in background)..."
        (
            exec 200>&-
            timeout -k 30 "${BACKFILL_TIMEOUT_SECONDS:-600}" \
            "$DOCKER_BIN" compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" \
                -f docker-compose.yml -f deploy/docker-compose.backfill.yml run --rm --no-deps -T \
                -e STORAGE_PATH=/app/db \
                --entrypoint node \
                web \
                scripts/migrate-media-to-r2.ts \
                && log "Media R2 backfill complete." \
                || log "WARNING: media R2 backfill failed — existing songs/thumbnails keep being read from local disk until the next run."
        ) &
        BG_MEDIA_PID=$!
    else
        log "No ${STORAGE_PATH_HOST}/{music,builds} dirs — skipping media backfill (nothing local to migrate)."
    fi
fi

# ── Step 3b: Fit the DB pools to the live max_connections ────────────────────
# The fleet's pool sizes assume the tuned host (max_connections = 200), but that
# tuning is a root action this sandboxed deploy cannot apply (see the host
# tuning preflight at the end). On a stock host (100) the fleet's peak — two web
# containers during the hotswap — exceeds the limit, and Postgres then refuses
# connections to EVERY service at once. scripts/db-connection-budget.mjs reads
# the real limit and, only when the configured pools do not fit, prints smaller
# sizes; they are exported here so `dc up` and hotswap-web.sh interpolate them
# (docker-compose.yml `${…_POOL_SIZE:-default}`). Non-fatal by design: if the
# server cannot be read, nothing is exported and pools stay as configured.
step_start "Fitting DB pools to the live max_connections..."
set +e
POOL_PLAN=$(dc run --rm --no-deps -T web node scripts/db-connection-budget.mjs 2>&1)
POOL_PLAN_EXIT=$?
set -e
while IFS= read -r line; do
    case "$line" in
        POOL:*)
            # Only the four known variables, only integers — never eval output.
            kv="${line#POOL:}"
            if [[ "$kv" =~ ^(DATABASE_POOL_SIZE|SERVER_DB_POOL_SIZE|AUTH_DB_POOL_SIZE|JOBS_DB_POOL_SIZE)=[0-9]+$ ]]; then
                export "$kv"
            fi
            ;;
        db-budget:*) log "  ${line}" ;;
    esac
done <<< "$POOL_PLAN"
if [ "$POOL_PLAN_EXIT" -ne 0 ]; then
    log "  WARNING: pool sizing check failed (exit ${POOL_PLAN_EXIT}) — pools left as configured."
fi
step_done

# ── Step 4: Bring up containers (everything EXCEPT web) ─────────────────────
# --no-build: image is already built in step 2, skip the build check.
# --scale web=0: the web service is NOT managed by compose anymore — compose
#   recreates containers IN PLACE (stop-old-then-start-new), which is exactly
#   the multi-second gap that produced the Cloudflare 520. The web container is
#   instead deployed blue/green by deploy/hotswap-web.sh below, which keeps the
#   old container serving until the new one is healthy and Apache has flipped.
#   All the OTHER services (socket, rmhbox, rmhtube, workers, minio, bot) start
#   here in parallel as before — a brief blip on a websocket/worker reconnect is
#   invisible, the user-facing 520 only ever came from the web port.
stage services
if [ -n "$BG_R2_PID" ]; then
    if ! wait "$BG_R2_PID"; then update_deploy_status fail "candidate static assets unavailable"; exit 1; fi
    BG_R2_PID=''
    release_event assets-published
fi
step_start "Starting containers (all services except web)..."
if ! dc up -d --no-build --remove-orphans --scale web=0; then
    log "ERROR: docker compose up failed."
    update_deploy_status fail "docker compose up failed"
    exit 1
fi
step_done

SUPERVISOR_METRICS_PORT="${PORT_SUPERVISOR_METRICS:-9090}"
check_supervisor() {
    for _ in $(seq 1 24); do
        if dc exec -T supervisor curl -fsS "http://localhost:${SUPERVISOR_METRICS_PORT}/health" >/dev/null 2>&1; then
            return 0
        fi
        sleep 5
    done
    return 1
}


# HTTP /health on each hub + status (a listening port alone said nothing about a
# hub that accepted connections but could not serve them).
check_http() {
    local port=$1
    for _ in $(seq 1 "${HTTP_HEALTH_TRIES:-24}"); do
        curl -fsS --max-time 4 "http://127.0.0.1:${port}/health" >/dev/null 2>&1 && return 0
        sleep 5
    done
    return 1
}

# The cron/queue workers have no port: healthy = still running, with no new
# restarts, after a settle window (a crash-loop shows up as RestartCount moving).
WORKER_SERVICES="jobs ladder-worker homes-worker"
worker_state() { # → "<running> <restartCount>" or "missing"
    local id
    id=$(dc ps -q "$1" 2>/dev/null | head -n1)
    [ -n "$id" ] || { echo missing; return; }
    "$DOCKER_BIN" inspect -f '{{.State.Running}} {{.RestartCount}}' "$id" 2>/dev/null || echo missing
}
check_workers() {
    local svc before after failed="" base=""
    if [ -f "${HEALTH_RESULT_FILE}.workers" ]; then
        base=$(cat "${HEALTH_RESULT_FILE}.workers")
    else
        for svc in $WORKER_SERVICES; do base="${base}${svc}|$(worker_state "$svc")"$'\n'; done
        printf '%s' "$base" > "${HEALTH_RESULT_FILE}.workers"
    fi
    sleep "${1:-${WORKER_SETTLE_SECONDS:-30}}"
    for svc in $WORKER_SERVICES; do
        before=$(printf '%s' "$base" | grep "^${svc}|" | cut -d'|' -f2-); after=$(worker_state "$svc")
        case "$after" in
            "true "*) [ "$after" = "$before" ] || failed="$failed $svc" ;;
            *) failed="$failed $svc" ;;
        esac
    done
    [ -z "$failed" ] || { echo "$failed"; return 1; }
}

# Runs every check in one parallel wave; prints the failing service names.
run_health_checks() {
    local failed="" job wf
    check_http "$PORT_SOCKET"  & local p_socket=$!
    check_http "$PORT_RMHBOX"  & local p_rmhbox=$!
    check_http "$PORT_RMHTUBE" & local p_rmhtube=$!
    check_http "$PORT_STATUS"  & local p_status=$!
    check_supervisor           & local p_sup=$!
    wf=$(mktemp); check_workers "${1:-${WORKER_SETTLE_SECONDS:-30}}" > "$wf" & local p_workers=$!
    for job in "socket:$p_socket" "rmhbox:$p_rmhbox" "rmhtube:$p_rmhtube" "status:$p_status" "supervisor:$p_sup"; do
        wait "${job#*:}" || failed="$failed ${job%%:*}"
    done
    wait "$p_workers" || failed="$failed $(cat "$wf")"
    rm -f "$wf"
    echo "$failed" | xargs
}

# Restore the non-web services to the release they ran before this deploy (the
# :rollback images), then re-check them. Web is left alone: it already passed
# its own smoke test + bake in the hotswap, and rolls back on its own.
rollback_non_web() {
    local img
    for img in "$IMAGE_NAME" "$FULL_IMAGE_NAME"; do
        "$DOCKER_BIN" image inspect "${img}:rollback" >/dev/null 2>&1 || return 1
    done
    log "Rolling back non-web services to the previous release..."
    for img in "$IMAGE_NAME" "$FULL_IMAGE_NAME"; do
        "$DOCKER_BIN" tag "${img}:rollback" "${img}:latest" || return 1
    done
    dc up -d --no-build --remove-orphans --scale web=0 || return 1
    local still
    rm -f "${HEALTH_RESULT_FILE}.workers"
    still=$(run_health_checks)
    [ -z "$still" ] || { log "Still unhealthy after rollback: $still"; return 1; }
}

export HEALTH_RESULT_FILE=$(mktemp)
(exec 200>&-; run_health_checks > "$HEALTH_RESULT_FILE") & BG_HEALTH_PID=$!

# ── Step 4b: Zero-downtime hotswap of the web container ─────────────────────
# Runs the freshly built image as a second web container on the spare port,
# waits until it actually serves traffic, then flips Apache to it with a
# graceful reload and retires the old one. If the new container never becomes
# healthy, traffic is never moved and the old container keeps serving — so a
# bad build degrades to "old version stays up", never to an outage.
#
# After the flip it smoke-tests the real user path and BAKES (default 5 min,
# BAKE_SECONDS) with the old container stopped as a rollback target; sustained
# failure flips traffic back automatically. Its exit code says which way it went
# (see EXIT_* in hotswap-web.sh), so the report below names a rollback as one.
# The deploy flock is held through the bake, so a newer push queues behind it.
stage swap
step_start "Hotswapping web container (blue/green, smoke + bake)..."
# hotswap-web.sh reports progress as `::deploy-stage::<key>` / `::deploy-note::<text>`
# lines on its stdout; this loop turns them into checklist edits and passes every
# other line through to the deploy log. Process substitution (not a pipe) so the
# loop runs in THIS shell and its stage state survives; fd 200 is closed inside
# for the same flock reason as the log tee above. The exit code rides out on the
# last line because a process substitution's status is not otherwise visible.
hotswap_rc=1
while IFS= read -r line; do
    case "$line" in
        ::deploy-stage::*) stage "${line#::deploy-stage::}" ;;
        ::deploy-note::*)  stage_note "${line#::deploy-note::}" ;;
        ::deploy-event::traffic-moved)
            node "$REPO_DIR/deploy/release-state.mjs" promote "$DEPLOY_STATE_DIR" "$DEPLOY_RELEASE_ID" "$PREV_RELEASE_ID"
            release_event traffic-moved ;;
        ::deploy-event::rolledback)
            node "$REPO_DIR/deploy/release-state.mjs" restore "$DEPLOY_STATE_DIR" "$DEPLOY_RELEASE_ID"
            release_event rolledback ;;
        ::deploy-rc::*)    hotswap_rc="${line#::deploy-rc::}" ;;
        *)                 printf '%s\n' "$line" ;;
    esac
done < <(
    exec 200>&-
    rc=0  # `|| rc=$?` keeps errexit (inherited here) from eating the exit code
    PROJECT_NAME="$PROJECT_NAME" \
     ENV_FILE="$ENV_FILE" \
     IMAGE_NAME="$IMAGE_NAME" \
     IMAGE_TAG="latest" \
     BLUE_PORT="$PORT_WEB" \
     GREEN_PORT="${PORT_WEB_GREEN:-$((PORT_WEB + 10))}" \
     NETWORK="${PROJECT_NAME}_default" \
     DOCKER_BIN="$DOCKER_BIN" \
     bash "${REPO_DIR}/deploy/hotswap-web.sh" 2>&1 || rc=$?
    echo "::deploy-rc::$rc"
)
case "$hotswap_rc" in
    0) ;;
    3)
        log "ERROR: new web failed its smoke test / bake — AUTO-ROLLED BACK to the previous container."
        update_deploy_status rolledback "web failed smoke/bake — previous release restored"
        exit 1
        ;;
    4)
        log "ERROR: new web failed its smoke test / bake and the rollback could not complete — NEW release still live. Investigate now."
        update_deploy_status fail "web failed smoke/bake and ROLLBACK FAILED — needs a human"
        exit 1
        ;;
    *)
        log "ERROR: web hotswap failed."
        update_deploy_status fail "web hotswap failed"
        exit 1
        ;;
esac
step_done

# ── Step 5: Health checks (parallel) ────────────────────────────────────────
# NOTE: web is intentionally NOT checked here — the hotswap in Step 4b already
# proved the new web container serves traffic before flipping Apache to it, and
# web now listens on the blue/green port, not the fixed $PORT_WEB.
# The supervisor /health gate (the five Go background workers) can take up to
# ~120s (it covers the DB WaitForReachable before the metrics server binds). It
# used to run AFTER the port checks, serializing the two waits. Run it as one
# more background job in the same wave so its long poll OVERLAPS the port checks —
# total health time becomes max(port, supervisor), not their sum.
# discord-bot / recap / doctrine-worker / vibe-worker / bot-worker run as
# goroutines inside the single `supervisor` process; it serves a MERGED
# /health + /metrics on METRICS_ADDR (:9090), NOT host-published, so we probe it
# from INSIDE the container with `dc exec`.
stage health
step_start "Joining service health checks (observed during web bake)..."
wait "$BG_HEALTH_PID"
BG_HEALTH_PID=''
failed_services=$(cat "$HEALTH_RESULT_FILE")
# Re-probe readiness and compare against the original worker snapshot after bake.
# This catches failures anywhere in the observation window without another sleep.
late_failures=$(run_health_checks 0)
failed_services=$(printf '%s %s' "$failed_services" "$late_failures" | xargs)
if [ -n "$failed_services" ]; then
    log "ERROR: health checks failed for: ${failed_services}"
    log "--- Container logs (${failed_services}) ---"
    # shellcheck disable=SC2086
    dc logs --tail=50 $failed_services 2>&1 || true
    if rollback_non_web; then
        update_deploy_status rolledback "${failed_services} failed health checks — non-web services restored to the previous release (web stays on this one)"
        exit 1
    fi
    update_deploy_status fail "${failed_services} failed health checks and ROLLBACK FAILED — needs a human"
    exit 1
fi

# Confirm the merged metrics registry exposes all five workers. A missing label
# means one worker silently failed to register inside the shared process (not
# that the process is down) — log it for the post-deploy watch rather than
# blocking the deploy.
SUP_METRICS=$(dc exec -T supervisor curl -fsS "http://localhost:${SUPERVISOR_METRICS_PORT}/metrics" 2>/dev/null || echo "")
for w in discord-bot recap doctrine-worker vibe-worker bot-worker; do
    printf '%s' "$SUP_METRICS" | grep -q "service=\"$w\"" || \
        log "WARNING: supervisor /metrics missing service=\"$w\" label — check that worker."
done

step_done

# ── Step 6: Prune stale images ───────────────────────────────────────────────
log "Pruning dangling images..."
"$DOCKER_BIN" image prune -f > /dev/null 2>&1 || true

# Keep at most 2 SHA-tagged images per environment for rollback.
prune_rollback_images 2
"$DOCKER_BIN" builder prune -f --filter "until=${DEPLOY_BUILD_CACHE_KEEP_HOURS:-72}h" > /dev/null 2>&1 || true

# Headroom enforcement: if disk is still under the headroom, take everything that
# is not running or the one rollback image (all BuildKit cache, unused images).
if [ "$(free_disk_gb)" -lt "$DEPLOY_HEADROOM_GB" ]; then
    log "Only $(free_disk_gb)G free (< ${DEPLOY_HEADROOM_GB}G headroom) — reclaiming everything not running."
    reclaim_disk hard "$DEPLOY_HEADROOM_GB"
    log "After reclaim: $(free_disk_gb)G disk free."
fi

# ── Join background best-effort jobs ─────────────────────────────────────────
# The R2 asset sync (Step 2a) runs in the background, overlapping migrations +
# bring-up + hotswap + health. Join it here so its log lines land before the
# completion banner. It's best-effort — any failure was already logged inside
# the job and must not fail the deploy.
if [ -n "${BG_R2_PID:-}" ]; then
    log "Waiting for background R2 asset sync to finish (if still running)..."
    wait "$BG_R2_PID" 2>/dev/null || true
fi
if [ -n "${BG_AVATAR_PID:-}" ]; then
    log "Waiting for background avatar R2 backfill to finish (if still running)..."
    wait "$BG_AVATAR_PID" 2>/dev/null || true
fi
if [ -n "${BG_MEDIA_PID:-}" ]; then
    log "Waiting for background media R2 backfill to finish (if still running)..."
    wait "$BG_MEDIA_PID" 2>/dev/null || true
fi

# ── Cloudflare cache rules (best-effort, perf audit §1.2 / §5.4) ──────────────
# Apply/refresh the edge cache ruleset (deploy/apply-cloudflare-cache-rules.sh):
# the image endpoints AND the anonymous default-locale homepage HTML — the latter
# activates server/nitro/anon-html-cache.ts so signed-out landing traffic is
# served from the edge instead of a full origin SSR render. The PUT replaces the
# whole ruleset, so this is IDEMPOTENT and safe to run every deploy. Fully guarded
# on credentials and best-effort: with no token it just logs and skips, and an API
# error only warns — it never fails the deploy. Creds may be exported in the
# environment or live in $ENV_FILE (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID).
{
    _cf_token="${CLOUDFLARE_API_TOKEN:-}"
    _cf_zone="${CLOUDFLARE_ZONE_ID:-}"
    if [ -z "$_cf_token" ] && [ -f "$ENV_FILE" ]; then
        _cf_token=$(grep -E '^CLOUDFLARE_API_TOKEN=' "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
    fi
    if [ -z "$_cf_zone" ] && [ -f "$ENV_FILE" ]; then
        _cf_zone=$(grep -E '^CLOUDFLARE_ZONE_ID=' "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
    fi
    if [ -n "$_cf_token" ] && [ -n "$_cf_zone" ]; then
        log "Applying Cloudflare cache rules (image endpoints + anon homepage HTML)..."
        if CLOUDFLARE_API_TOKEN="$_cf_token" CLOUDFLARE_ZONE_ID="$_cf_zone" \
            bash "${REPO_DIR}/deploy/apply-cloudflare-cache-rules.sh" >/dev/null 2>&1; then
            log "Cloudflare cache rules applied."
        else
            log "WARNING: Cloudflare cache-rule apply failed — anon HTML edge cache may be inactive until re-run (bash deploy/apply-cloudflare-cache-rules.sh)."
        fi
    else
        log "Cloudflare creds not set (CLOUDFLARE_API_TOKEN/CLOUDFLARE_ZONE_ID) — skipping edge cache-rule apply (anon HTML served from origin until applied)."
    fi
} 2>/dev/null || true

# The webhook cannot edit the host vhost. Keep the Wasm policy prerequisite
# visible after deploy; JS remains functional until an operator applies it.
if [ "$ENVIRONMENT" = "production" ]; then
    {
        _wasm_csp=$(curl -fsSI --max-time 5 -H 'Host: rmhstudios.com' http://127.0.0.1/ \
            | tr -d '\r' | grep -i '^content-security-policy:' || true)
        if [ -n "$_wasm_csp" ] && ! printf '%s\n' "$_wasm_csp" \
            | grep -Eiq "script-src[^;]*'wasm-unsafe-eval'"; then
            log "WARNING: the live Apache CSP does not allow WebAssembly; the globe is using its JavaScript fallback."
            log "Sync deploy/apache/rmhstudios.conf to the host vhost and validate/reload Apache (docs/frontend-webassembly.md)."
        fi
    } 2>/dev/null || true
fi

# ── Host perf-tuning preflight (non-fatal, perf audit §1.3/§1.4) ──────────────
# The Postgres + Apache tuning (deploy/postgres/postgresql.tuning.conf,
# deploy/apache/mpm_event.conf) is a HOST action this deploy CANNOT perform: the
# webhook runs sandboxed (ProtectSystem=strict — no /etc writes, no service
# restarts). We can still DETECT whether it was applied — apply-perf-tuning.sh
# installs two well-known files — and nag on every deploy until it is, so an
# untuned box (stock max_connections=100, Apache MaxRequestWorkers ~400) doesn't
# silently cap the whole fleet under load. Fully guarded: never affects the
# deploy result.
{
    _tuning_missing=0
    # Host Postgres only (skip when the DB is external / not on this host).
    if [ -d /etc/postgresql ]; then
        ls /etc/postgresql/*/main/conf.d/rmhstudios-tuning.conf >/dev/null 2>&1 || _tuning_missing=1
    fi
    # Host Apache MPM tuning (a2enconf symlinks into conf-enabled).
    if command -v apache2ctl >/dev/null 2>&1 || command -v apachectl >/dev/null 2>&1; then
        [ -e /etc/apache2/conf-enabled/mpm-tuning.conf ] || _tuning_missing=1
    fi
    if [ "$_tuning_missing" = "1" ]; then
        log "  ┌── ⚠  HOST PERF TUNING NOT FULLY APPLIED ──────────────────────────"
        log "  │ Postgres max_connections and/or Apache MaxRequestWorkers look like"
        log "  │ stock defaults (100 / ~400), which caps the fleet under load. This"
        log "  │ sandboxed deploy cannot change host config. Apply ONCE on the host"
        log "  │ (idempotent, needs root):"
        log "  │     sudo bash deploy/apply-perf-tuning.sh"
        log "  │ or enable the unit: deploy/systemd/rmhstudios-perf-tuning.service"
        log "  └───────────────────────────────────────────────────────────────────"
    else
        log "Host perf tuning present (Postgres + Apache tuning files installed)."
    fi
} 2>/dev/null || true

# ── Done ─────────────────────────────────────────────────────────────────────
release_event validated
update_deploy_status success

# Watch the new release for 15 min and roll it back if the page/API 5xx or
# latency alarms fire on its traffic (deploy/post-deploy-guard.sh). Detached,
# so the deploy lock is released now; the guard stands down on a newer deploy.
# Off for the redeploy the guard itself starts (POST_DEPLOY_GUARD=0).
# `200>&-` is what actually releases the lock: a detached child inherits fd 200,
# and the flock lives as long as any holder of that open file does — without it
# the guard pinned the lock for its whole 15 minutes and every deploy pushed in
# that window queued behind it (the guard only stands down once a newer release
# is live, which it could not become while waiting for the lock).
# DEPLOY_SHORT_HASH is only set when the Discord announcer ran; GIT_SHA is the same value.
GUARD_SHA="${DEPLOY_SHORT_HASH:-$GIT_SHA}"
if [ "${POST_DEPLOY_GUARD:-1}" = 1 ] && [ -x "${REPO_DIR}/deploy/post-deploy-guard.sh" ] \
   && [ -n "${PREV_DEPLOYED_SHA:-}" ] && [ "${PREV_DEPLOYED_SHA:0:7}" != "${GUARD_SHA:0:7}" ]; then
    DEPLOY_EXPECT_LIVE_ID="$DEPLOY_RELEASE_ID" setsid nohup bash "${REPO_DIR}/deploy/post-deploy-guard.sh" "$GUARD_SHA" "$PREV_DEPLOYED_SHA" "$(date +%s)" \
        >> "${GUARD_LOG:-/home/rmhstudios/post-deploy-guard.log}" 2>&1 < /dev/null 200>&- &
    log "Post-deploy guard started (15 min, rollback target ${PREV_DEPLOYED_SHA:0:12})."
fi

log "=== Deployment complete ($ENVIRONMENT: web=$PORT_WEB, socket=$PORT_SOCKET, rmhbox=$PORT_RMHBOX, rmhtube=$PORT_RMHTUBE, status=$PORT_STATUS) ==="

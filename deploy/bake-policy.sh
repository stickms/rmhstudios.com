#!/usr/bin/env bash
#
# The bake's rollback policy, as functions hotswap-web.sh sources (and
# deploy/__tests__/bake-policy.test.ts exercises): given what one probe round saw,
# should the new web container be rolled back?
#
# What it guards against is rolling back a HEALTHY release because the host was
# slow, not because the release was broken. A fresh container is cold (empty caches,
# cold DB pool, JIT), the host is busy starting the other services, and the bake
# probes the DB-backed routes (/sitemap.xml, /blog/rss.xml) that are slowest to warm.
# So:
#   - a startup GRACE window: failed rounds in the first BAKE_GRACE_SECONDS are
#     logged but not counted (the smoke gate already proved the release once);
#   - two kinds of failure. smoke-test.sh exits 1 for a BROKEN response (a 4xx/500,
#     or a 200 without the page) and 2 for a SLOW or UNREACHABLE one (a timeout, no
#     connection, a 502/503/504). Broken rolls back after BAKE_FAIL_THRESHOLD in a row;
#     slow needs BAKE_SOFT_FAIL_THRESHOLD in a row, about three minutes at the default
#     20 s interval, because a timeout is evidence about the host as often as the release;
#   - restarts: up to BAKE_RESTARTS_TOLERATED restarts are tolerated if the container
#     is running again (one OOM kill is not a bad release, a crash loop is), and a
#     container seen down once is retried a round before it counts.
#
# The counters are globals and the reason comes back in BAKE_REASON, so call these directly (not inside
# `$(...)`, whose subshell would throw the counters away).

BAKE_GRACE_SECONDS="${BAKE_GRACE_SECONDS:-90}"
BAKE_FAIL_THRESHOLD="${BAKE_FAIL_THRESHOLD:-3}"
BAKE_SOFT_FAIL_THRESHOLD="${BAKE_SOFT_FAIL_THRESHOLD:-9}"
BAKE_RESTARTS_TOLERATED="${BAKE_RESTARTS_TOLERATED:-1}"

bake_policy_init() {
    BAKE_REASON=""
    BAKE_HARD_STREAK=0
    BAKE_ANY_STREAK=0
    BAKE_DOWN_STREAK=0
}

# bake_policy_probe <smoke exit code: 0 ok | 1 broken | 2 slow/unreachable> <seconds since the bake began>
# Returns 1 and sets BAKE_REASON when the release should be rolled back.
bake_policy_probe() {
    local rc=$1 elapsed=$2
    if [ "$rc" -eq 0 ]; then
        BAKE_HARD_STREAK=0
        BAKE_ANY_STREAK=0
        return 0
    fi
    # The grace window neither counts a failure nor forgives the ones before it (there are none yet).
    [ "$elapsed" -ge "$BAKE_GRACE_SECONDS" ] || return 0
    BAKE_ANY_STREAK=$((BAKE_ANY_STREAK + 1))
    if [ "$rc" -eq 1 ]; then BAKE_HARD_STREAK=$((BAKE_HARD_STREAK + 1)); else BAKE_HARD_STREAK=0; fi
    if [ "$BAKE_HARD_STREAK" -ge "$BAKE_FAIL_THRESHOLD" ]; then
        BAKE_REASON="${BAKE_HARD_STREAK} consecutive broken responses during the bake"
        return 1
    fi
    if [ "$BAKE_ANY_STREAK" -ge "$BAKE_SOFT_FAIL_THRESHOLD" ]; then
        BAKE_REASON="${BAKE_ANY_STREAK} consecutive failed rounds (slow or unreachable) during the bake"
        return 1
    fi
    return 0
}

# bake_policy_container <running: true|false> <restarts now> <restarts at the start of the bake>
# Returns 1 and sets BAKE_REASON when the container's own state says roll back.
bake_policy_container() {
    local running=$1 restarts=$2 restarts0=$3
    if [ "$running" != "true" ]; then
        BAKE_DOWN_STREAK=$((BAKE_DOWN_STREAK + 1))
        if [ "$BAKE_DOWN_STREAK" -ge 2 ]; then
            BAKE_REASON="the new container was down in ${BAKE_DOWN_STREAK} consecutive rounds (running=${running})"
            return 1
        fi
        return 0
    fi
    BAKE_DOWN_STREAK=0
    if [[ "$restarts" =~ ^[0-9]+$ && "$restarts0" =~ ^[0-9]+$ ]] && [ $((restarts - restarts0)) -gt "$BAKE_RESTARTS_TOLERATED" ]; then
        BAKE_REASON="the new container restarted $((restarts - restarts0))x during the bake (restarts ${restarts0}→${restarts}, ${BAKE_RESTARTS_TOLERATED} tolerated)"
        return 1
    fi
    return 0
}

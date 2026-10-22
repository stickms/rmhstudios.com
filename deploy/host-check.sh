#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# host-check.sh — the VPS's own health, reported to the on-call watchdog.
#
# No container can see the host's disks, memory or kernel log, so this runs
# on the host itself, once a minute, from rmh-host-check.timer (as root: it
# reads the kernel log and asks Docker for restart counts). Read-only: it
# never changes anything on the box.
#
#   A13 Sev2  disk >= 92% on / or Docker's data dir     (B01 Sev3 at >= 85%)
#   A14 Sev2  MemAvailable < 5%, or a kernel OOM kill in the last 30 min
#   B05 Sev3  a container is unhealthy, or restarted outside a deploy (30 min)
#   + a "host" heartbeat each run: if the timer stops, the watchdog pages.
#
# Alarms are sent through deploy/oncall-send.sh, only when their state
# changes (plus a re-send of anything firing every 10 min), so a healthy
# box sends one heartbeat a minute and nothing else. State lives in
# $STATE_DIR (StateDirectory= in the unit).
#
# Env: STATE_DIR (default /var/lib/rmh-host-check), DOCKER_BIN (default docker),
#      DISK_WARN / DISK_CRIT (85 / 92), MEM_CRIT_PCT (5).
#      Test seams: HOST_CHECK_SEND (the sender), MEMINFO (/proc/meminfo),
#      DEPLOY_LOCKS (deploy.sh's lock files).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEND="${HOST_CHECK_SEND:-$REPO_DIR/deploy/oncall-send.sh}"  # override: tests
STATE_DIR="${STATE_DIR:-/var/lib/rmh-host-check}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
DISK_WARN="${DISK_WARN:-85}"
DISK_CRIT="${DISK_CRIT:-92}"
MEM_CRIT_PCT="${MEM_CRIT_PCT:-5}"
REFRESH_SECS=600
HOLD_SECS=1800 # how long an OOM kill / unexpected restart keeps its alarm firing
NOW=$(date +%s)
HOST=$(hostname)

mkdir -p "$STATE_DIR" 2>/dev/null || true

# ── alarm state: send only on change, re-send firing every REFRESH_SECS ──────
# report <key> <firing|ok> <id> <sev> <title> <detail> [instance]
report() {
  local key="$1" want="$2" id="$3" sev="$4" title="$5" detail="$6" instance="${7:-}"
  local file="$STATE_DIR/alarm-${key//[^A-Za-z0-9_.-]/_}" prev="ok" sent=0
  [ -f "$file" ] && read -r prev sent < "$file"
  if [ "$want" = firing ]; then
    if [ "$prev" != firing ] || [ $((NOW - sent)) -ge "$REFRESH_SECS" ]; then
      bash "$SEND" alert firing "$id" "$sev" "$title" "$detail" "$instance"
      echo "firing $NOW" > "$file"
    fi
  elif [ "$prev" = firing ]; then
    bash "$SEND" alert resolved "$id" "$sev" "$title" "$detail" "$instance"
    echo "ok $NOW" > "$file"
  fi
}

# ── Disk: / and Docker's data dir (often the same filesystem — reported once) ─
docker_root=$("$DOCKER_BIN" info --format '{{.DockerRootDir}}' 2>/dev/null || true)
seen_fs=" "
for path in / ${docker_root:+"$docker_root"}; do
  [ -d "$path" ] || continue
  read -r fs used_pct mount < <(df -P "$path" 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $1, $5, $6}')
  [ -n "${fs:-}" ] || continue
  case "$seen_fs" in *" $fs "*) continue ;; esac
  seen_fs+="$fs "
  inst=$( [ "$mount" = / ] && echo root || echo "${mount//\//-}" | sed 's/^-//' )
  detail="$mount is ${used_pct}% full on $HOST ($fs). deploy/disk-report.sh shows where the space went."
  if [ "$used_pct" -ge "$DISK_CRIT" ]; then
    report "disk-crit-$inst" firing A13 2 "Disk almost full: $mount" "$detail" "$inst"
    report "disk-warn-$inst" ok B01 3 "Disk filling up: $mount" "$detail" "$inst"
  elif [ "$used_pct" -ge "$DISK_WARN" ]; then
    report "disk-crit-$inst" ok A13 2 "Disk almost full: $mount" "$detail" "$inst"
    report "disk-warn-$inst" firing B01 3 "Disk filling up: $mount" "$detail" "$inst"
  else
    report "disk-crit-$inst" ok A13 2 "Disk almost full: $mount" "$detail" "$inst"
    report "disk-warn-$inst" ok B01 3 "Disk filling up: $mount" "$detail" "$inst"
  fi
done

# ── Memory ───────────────────────────────────────────────────────────────────
read -r mem_total mem_avail < <(awk '/^MemTotal:/ {t=$2} /^MemAvailable:/ {a=$2} END {print t, a}' "${MEMINFO:-/proc/meminfo}")
if [ "${mem_total:-0}" -gt 0 ]; then
  avail_pct=$((mem_avail * 100 / mem_total))
  detail="MemAvailable ${avail_pct}% ($((mem_avail / 1024)) of $((mem_total / 1024)) MiB) on $HOST. Biggest containers: docker stats --no-stream."
  if [ "$avail_pct" -lt "$MEM_CRIT_PCT" ]; then
    report mem-low firing A14 2 "Host memory almost exhausted" "$detail" memory
  else
    report mem-low ok A14 2 "Host memory almost exhausted" "$detail" memory
  fi
fi

# ── OOM kills (kernel log since the last run) ────────────────────────────────
last_oom_check=$(cat "$STATE_DIR/oom-checked" 2>/dev/null || echo $((NOW - 120)))
oom_lines=$(journalctl -k --since "@$last_oom_check" --no-pager -q 2>/dev/null \
  | grep -iE 'out of memory|oom-kill|killed process' || true)
echo "$NOW" > "$STATE_DIR/oom-checked"
if [ -n "$oom_lines" ]; then
  echo "$NOW" > "$STATE_DIR/oom-last"
  printf '%s\n' "$oom_lines" | tail -n 3 > "$STATE_DIR/oom-detail"
fi
oom_last=$(cat "$STATE_DIR/oom-last" 2>/dev/null || echo 0)
if [ $((NOW - oom_last)) -lt "$HOLD_SECS" ]; then
  report oom firing A14 2 "Kernel OOM killer fired" \
    "On $HOST: $(tr '\n' ' ' < "$STATE_DIR/oom-detail" 2>/dev/null | cut -c1-900)" oom
else
  report oom ok A14 2 "Kernel OOM killer fired" "No OOM kills for 30 min on $HOST." oom
fi

# ── Containers: unhealthy, or restarted outside a deploy ─────────────────────
deploying=0
# deploy.sh holds this flock for the whole deploy; restarts during it are expected.
for lock in ${DEPLOY_LOCKS:-/tmp/autodeploy-*.lock}; do
  [ -e "$lock" ] || continue
  if ! flock -n "$lock" true 2>/dev/null; then deploying=1; fi
done
if command -v "$DOCKER_BIN" >/dev/null 2>&1; then
  while read -r name health restarts; do
    [ -n "$name" ] || continue
    if [ "$health" = unhealthy ]; then
      report "unhealthy-$name" firing B05 3 "Container unhealthy: $name" "docker inspect $name --format '{{json .State.Health}}' on $HOST" "$name"
    else
      report "unhealthy-$name" ok B05 3 "Container unhealthy: $name" "$name is healthy again" "$name"
    fi
    rfile="$STATE_DIR/restarts-$name"
    prev=$(cat "$rfile" 2>/dev/null || echo "$restarts")
    echo "$restarts" > "$rfile"
    if [ "$restarts" -gt "$prev" ] && [ "$deploying" = 0 ]; then
      echo "$NOW $((restarts - prev))" > "$STATE_DIR/restart-last-$name"
    fi
    if [ -f "$STATE_DIR/restart-last-$name" ]; then
      read -r at n < "$STATE_DIR/restart-last-$name"
      if [ $((NOW - at)) -lt "$HOLD_SECS" ]; then
        report "restart-$name" firing B05 3 "Container restarted: $name" \
          "$name restarted ${n}x outside a deploy (Docker RestartCount now $restarts) on $HOST. docker logs $name --tail 100" "$name-restarts"
      else
        report "restart-$name" ok B05 3 "Container restarted: $name" "No restarts for 30 min." "$name-restarts"
      fi
    fi
  done < <("$DOCKER_BIN" ps -q 2>/dev/null | xargs -r "$DOCKER_BIN" inspect \
    --format '{{.Name}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.RestartCount}}' 2>/dev/null \
    | sed 's#^/##')
fi

# Last: a run that died above doesn't count as alive.
bash "$SEND" heartbeat host
exit 0

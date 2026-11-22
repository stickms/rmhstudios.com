#!/usr/bin/env bash
# Screenshots of the site in iOS Safari, inside an iOS simulator. macOS only (Xcode); it is what
# .github/workflows/ios-safari-screenshots.yml runs. Why it exists and how to read the pictures:
# docs/ios-safari-screenshots.md.
#
#   scripts/ios-sim/capture.sh <base-url> <out-dir>
#
# Environment (all optional):
#   ROUTES       comma-separated paths, default "/"
#   APPEARANCES  "light dark" (Day and Night: with nothing stored, the pre-paint script follows the device)
#   DEVICE       simulator name to prefer, default "iPhone 17 Pro" (falls back to the newest iPhone)
#   OPEN_GLOBE   "1" taps the docked globe and shoots again (needs `idb`, best effort)
#   SCROLL_BOTTOM "1" (default) also swipes to the bottom of the page and shoots it (needs `idb`); SWIPES caps the swipes (25)
#   NAME_PREFIX  prefix for the file names, default "" (the themed run uses "theme-")
#   SETTLE       seconds to wait after a page opens, default 8
#
# The simulator shares the host's network, so a server on localhost:7005 is reachable as http://localhost:7005.
set -euo pipefail

BASE="${1:?usage: capture.sh <base-url> <out-dir>}"
OUT="${2:?usage: capture.sh <base-url> <out-dir>}"
ROUTES="${ROUTES:-/}"
APPEARANCES="${APPEARANCES:-light dark}"
DEVICE="${DEVICE:-iPhone 17 Pro}"
SETTLE="${SETTLE:-8}"
NAME_PREFIX="${NAME_PREFIX:-}"
mkdir -p "$OUT"

# pip installs idb into the user base, which is not on the runner's PATH.
IDB="$(command -v idb || true)"
[ -n "$IDB" ] || { for d in "$(python3 -m site --user-base 2>/dev/null)/bin" "$HOME/Library/Python"/*/bin; do [ -x "$d/idb" ] && IDB="$d/idb" && break; done; }
if [ "${OPEN_GLOBE:-0}" = "1" ]; then
  if [ -n "$IDB" ]; then echo "idb: $IDB"; else echo "idb: NOT FOUND, so the globe-open shots and the popup dismissal are skipped"; fi
fi

# Newest installed iOS runtime, and the device type to put on it.
RUNTIME=$(xcrun simctl list runtimes -j | python3 -c '
import json, sys
rt = [r for r in json.load(sys.stdin)["runtimes"] if r.get("isAvailable") and r["identifier"].split(".")[-1].startswith("iOS")]
rt.sort(key=lambda r: [int(x) for x in r["version"].split(".")])
print(rt[-1]["identifier"] if rt else "")
')
[ -n "$RUNTIME" ] || { echo "no iOS simulator runtime installed"; xcrun simctl list runtimes; exit 1; }

DEVTYPE=$(xcrun simctl list devicetypes -j | DEVICE="$DEVICE" python3 -c '
import json, os, sys
types = json.load(sys.stdin)["devicetypes"]
iph = [t for t in types if t["name"].startswith("iPhone")]
want = [t for t in iph if t["name"] == os.environ["DEVICE"]]
print((want or iph[-1:])[0]["identifier"] if iph else "")
')
[ -n "$DEVTYPE" ] || { echo "no iPhone device type"; exit 1; }

echo "runtime: $RUNTIME"
echo "device:  $DEVTYPE"
UDID=$(xcrun simctl create rmh-shoot "$DEVTYPE" "$RUNTIME")
trap 'xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true; xcrun simctl delete "$UDID" >/dev/null 2>&1 || true' EXIT
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b >/dev/null
# A fixed clock and full bars, so two runs of the same code give the same picture.
xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState charged --batteryLevel 100 \
  --cellularMode active --cellularBars 4 --wifiBars 3 || true

# `simctl openurl` times out when the runner is busy (3 cores shared with the server and Postgres): try again, and skip a
# page that never opens rather than ending the whole run.
open_url() {
  for attempt in 1 2 3; do
    xcrun simctl openurl "$UDID" "$1" && return 0
    echo "openurl $1 failed (attempt $attempt), retrying"
    sleep 15
  done
  return 1
}

shoot() { # name
  xcrun simctl io "$UDID" screenshot --type=png "$OUT/${NAME_PREFIX}$1.png" >/dev/null
  echo "wrote $OUT/${NAME_PREFIX}$1.png"
}

# Screen size in points (idb reports it; an iPhone 17 Pro is 402 x 874).
screen_points() {
  "$IDB" describe --udid "$UDID" --json 2>/dev/null | python3 -c '
import json, sys
def find(o):
    if isinstance(o, dict):
        if "width_points" in o and "height_points" in o:
            return o
        for v in o.values():
            r = find(v)
            if r: return r
    return None
try:
    d = find(json.load(sys.stdin)) or {}
except Exception:
    d = {}
print(int(d.get("width_points", 402)), int(d.get("height_points", 874)))
'
}

first=1
for appearance in $APPEARANCES; do
  xcrun simctl ui "$UDID" appearance "$appearance"
  sleep 5
  IFS=',' read -ra paths <<<"$ROUTES"
  for path in "${paths[@]}"; do
    slug=$(echo "${path:-/}" | sed 's#^/##; s#/#_#g'); slug="${slug:-home}"
    open_url "${BASE%/}${path}" || { echo "could not open ${path}, skipping it"; continue; }
    sleep "$SETTLE"
    if [ "$first" = "1" ] && [ -n "$IDB" ]; then
      # Safari's one-time "View Bookmarks, Share Menu, and Open Tabs" popup: its close button is at about 90% x 71% y.
      read -r W H < <(screen_points)
      "$IDB" ui tap --udid "$UDID" $((W * 90 / 100)) $((H * 71 / 100)) >/dev/null 2>&1 || true
      sleep 1
      first=0
    fi
    shoot "${slug}-${appearance}"
    if [ "${SCROLL_BOTTOM:-1}" = "1" ] && [ -n "$IDB" ]; then
      # The bottom of the page: the strip behind Safari's tab bar is outside the document, so a wash that stops at the
      # document's end shows as a seam there. Swipe up until the page stops moving (SWIPES at most), then shoot.
      read -r W H < <(screen_points)
      for _ in $(seq 1 "${SWIPES:-25}"); do
        "$IDB" ui swipe --udid "$UDID" $((W / 2)) $((H * 75 / 100)) $((W / 2)) $((H * 20 / 100)) --duration 0.15 >/dev/null 2>&1 || break
      done
      sleep 2
      shoot "${slug}-${appearance}-bottom"
      # Back to the top for the globe tap below.
      open_url "${BASE%/}${path}" || true
      sleep "$SETTLE"
    fi
    if [ "${OPEN_GLOBE:-0}" = "1" ] && [ -n "$IDB" ]; then
      read -r W H < <(screen_points)
      # The docked globe: centred, about 150pt above the screen bottom (18px off the visual viewport, which ends above
      # Safari's tab bar).
      "$IDB" ui tap --udid "$UDID" $((W / 2)) $((H - 150)) >/dev/null 2>&1 || echo "idb tap failed"
      sleep 2
      shoot "${slug}-${appearance}-globe-open"
    fi
  done
done

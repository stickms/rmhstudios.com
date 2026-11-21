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
mkdir -p "$OUT"

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

shoot() { # name
  xcrun simctl io "$UDID" screenshot --type=png "$OUT/$1.png" >/dev/null
  echo "wrote $OUT/$1.png"
}

for appearance in $APPEARANCES; do
  xcrun simctl ui "$UDID" appearance "$appearance"
  IFS=',' read -ra paths <<<"$ROUTES"
  for path in "${paths[@]}"; do
    slug=$(echo "${path:-/}" | sed 's#^/##; s#/#_#g'); slug="${slug:-home}"
    xcrun simctl openurl "$UDID" "${BASE%/}${path}"
    sleep "$SETTLE"
    shoot "${slug}-${appearance}"
    if [ "${OPEN_GLOBE:-0}" = "1" ] && command -v idb >/dev/null 2>&1; then
      # The docked globe: horizontally centred, about 50pt above the bottom edge of the screen.
      read -r W H < <(idb describe --udid "$UDID" --json | python3 -c '
import json, sys
d = json.load(sys.stdin)["screen_dimensions"]
print(int(d["width_points"]), int(d["height_points"]))
')
      idb ui tap --udid "$UDID" $((W / 2)) $((H - 90)) || true
      sleep 2
      shoot "${slug}-${appearance}-globe-open"
    fi
  done
done

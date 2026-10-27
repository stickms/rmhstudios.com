set -e
cp "$GITHUB_WORKSPACE/tools/overlay/"*.py "$GITHUB_WORKSPACE/code/scripts/tf2-assets/"
CODE="$GITHUB_WORKSPACE/code" python3 tools/anim_test.py "$1/game"
W=$HOME/cw; mkdir -p $W; cp tools/compose.mjs tools/overlay/warpaint.ts $W/; cd $W
npm init -y >/dev/null; npm i sharp tsx >/dev/null 2>&1
npx tsx compose.mjs concealedkiller_sniperrifle_nightowl 2>&1 | tail -30

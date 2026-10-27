set -e
cp "$GITHUB_WORKSPACE/tools/overlay/"*.py "$GITHUB_WORKSPACE/code/scripts/tf2-assets/"
CODE="$GITHUB_WORKSPACE/code" python3 tools/anim_test.py "$1/game"
npx --yes gltf-validator /tmp/out/class_scout.glb 2>&1 | head -40 || true
npx --yes gltf-validator /tmp/out/anim_scout_taunt_conga.glb 2>&1 | head -30 || true

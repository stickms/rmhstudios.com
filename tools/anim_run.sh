set -e
cp "$GITHUB_WORKSPACE/tools/overlay/"*.py "$GITHUB_WORKSPACE/code/scripts/tf2-assets/" 2>/dev/null || true
CODE="$GITHUB_WORKSPACE/code" python3 -I tools/anim_test.py "$1/game"

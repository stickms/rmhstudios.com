set -e
cp "$GITHUB_WORKSPACE/tools/overlay/"*.py "$GITHUB_WORKSPACE/code/scripts/tf2-assets/"
CODE="$GITHUB_WORKSPACE/code" python3 tools/anim_test.py "$1/game"

set -e
cp "$GITHUB_WORKSPACE/tools/overlay/"*.py "$GITHUB_WORKSPACE/code/scripts/tf2-assets/"
CODE="$GITHUB_WORKSPACE/code" python3 tools/anim_test.py "$1/game" | tail -5
W=$HOME/rw; mkdir -p $W && cp tools/render/page.html tools/render/render.mjs $W/ && cd $W
npm init -y >/dev/null && npm i three@0.169.0 playwright gltf-validator >/dev/null 2>&1
npx playwright install --with-deps chromium >/dev/null 2>&1
ln -sfn /tmp/out $W/out
node -e "
const v=require('gltf-validator');const fs=require('fs');
for (const f of ['class_scout.glb','anim_scout_taunt_conga.glb']) {
  v.validateBytes(new Uint8Array(fs.readFileSync('/tmp/out/'+f))).then(r=>console.log(f, JSON.stringify(r.issues.numErrors),'errors',r.issues.numWarnings,'warnings', JSON.stringify(r.issues.messages.slice(0,6).map(m=>m.code+' '+m.message))));
}"
(python3 -m http.server 8123 >/dev/null 2>&1 &) ; sleep 1
node render.mjs scout taunt_conga

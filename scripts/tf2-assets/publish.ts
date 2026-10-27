/**
 * Publish converted TF2 assets to the site's object storage, uploading only
 * what changed. Used by `.github/workflows/tf2-assets-sync.yml`; the Python
 * steps (`convert.py`, `hud.py`) do the conversion, this does the bucket side.
 *
 *   publish.ts gate  --state-key K --build <steam build> [--builder N] [--force] [--as name]
 *       Prints `run=true|false` (`run_<name>` with --as; also appended to $GITHUB_OUTPUT): is there
 *       anything to do for this Steam build? Costs one small GET.
 *   publish.ts state --state-key K --out state.json
 *       Download the channel's state file (an empty one when there is none yet).
 *   publish.ts push  --dir D --prefix P --state-key K --build <id> [--builder N] [--prune]
 *       D holds `wanted.json` ({ <relative path>: { src } }) and the files that
 *       changed. Files whose source hash matches the state are never sent;
 *       changed ones are Brotli-compressed and stored with their encoding; the
 *       state file is rewritten last. Stale objects are deleted only with --prune.
 *
 * Why no ListObjects: the state file is the only index, so a run that changes
 * nothing costs a single GET, and cost scales with what changed, not with the
 * size of the bucket.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, constants as zc } from 'node:zlib';
import { deleteObject, getObject, putObject } from '../../lib/storage/s3.server';
import {
  MODEL_BUILDER_VERSION,
  nextState,
  parseState,
  planSync,
  shouldRun,
  type PublishedModel,
} from '../../lib/tf2-loadout/model-sync';

const [cmd, ...rest] = process.argv.slice(2);
const flags = new Map<string, string>();
const bare = new Set<string>();
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (!a.startsWith('--')) continue;
  const next = rest[i + 1];
  if (next !== undefined && !next.startsWith('--')) {
    flags.set(a.slice(2), next);
    i++;
  } else bare.add(a.slice(2));
}
const need = (name: string): string => {
  const v = flags.get(name);
  if (!v) {
    console.error(`missing --${name}`);
    process.exit(2);
  }
  return v;
};

const CONTENT_TYPE: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.json': 'application/json',
  '.vtf': 'application/octet-stream',
  '.vmt': 'text/plain; charset=utf-8',
  '.res': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.menu': 'text/plain; charset=utf-8',
};

async function loadState(key: string) {
  const obj = await getObject(key).catch(() => null);
  return parseState(obj ? obj.body.toString('utf8') : null);
}

function setOutput(name: string, value: string): void {
  process.stdout.write(`${name}=${value}\n`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

const builder = Number(flags.get('builder') ?? MODEL_BUILDER_VERSION);

if (cmd === 'gate') {
  const state = await loadState(need('state-key'));
  const build = flags.get('build') || null;
  const d = shouldRun(state, build, { force: bare.has('force'), builder });
  const as = flags.get('as') ? `_${flags.get('as')}` : '';
  setOutput(`run${as}`, String(d.run));
  setOutput(`reason${as}`, d.reason);
} else if (cmd === 'state') {
  const state = await loadState(need('state-key'));
  writeFileSync(need('out'), JSON.stringify(state));
  process.stdout.write(`${Object.keys(state.models).length} published entries\n`);
} else if (cmd === 'push') {
  const dir = need('dir');
  const prefix = need('prefix');
  const stateKey = need('state-key');
  const build = flags.get('build') ?? null;
  const wantedRaw = JSON.parse(readFileSync(path.join(dir, 'wanted.json'), 'utf8')) as Record<
    string,
    { src: string }
  >;
  const state = await loadState(stateKey);
  const plan = planSync(
    state,
    Object.entries(wantedRaw).map(([name, v]) => ({ name, src: v.src })),
  );

  const published: Record<string, PublishedModel> = {};
  let sent = 0;
  let bytes = 0;
  let missing = 0;
  const queue = [...plan.upload];
  const worker = async (): Promise<void> => {
    for (let w = queue.shift(); w; w = queue.shift()) {
      const file = path.join(dir, w.name);
      if (!existsSync(file)) {
        missing++; // listed as wanted but not produced (a conversion failure): retried next run
        continue;
      }
      const raw = readFileSync(file);
      const ct = CONTENT_TYPE[path.extname(w.name).toLowerCase()] ?? 'application/octet-stream';
      const br = brotliCompressSync(raw, {
        params: {
          [zc.BROTLI_PARAM_QUALITY]: 9,
          [zc.BROTLI_PARAM_SIZE_HINT]: raw.length,
        },
      });
      // Only keep the Brotli form when it really is smaller (already-compressed
      // WebP-in-GLB barely shrinks); otherwise store the file as it is.
      const useBr = br.length < raw.length * 0.95;
      const body = useBr ? br : raw;
      await putObject(prefix + w.name, body, ct, useBr ? 'br' : undefined);
      published[w.name] = { src: w.src, size: body.length };
      sent++;
      bytes += body.length;
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));

  let removed: string[] = [];
  if (bare.has('prune')) {
    // A model that failed to convert this run drops out of `wanted`; it is not gone, so keep it.
    const failedFile = path.join(dir, 'failed.json');
    const failed = new Set<string>(existsSync(failedFile) ? JSON.parse(readFileSync(failedFile, 'utf8')) : []);
    removed = plan.stale.filter((n) => !failed.has(n));
    for (const name of removed) await deleteObject(prefix + name);
  }

  // Only advance the build id when everything wanted is now published, so a
  // partial failure is retried on the next run instead of being skipped.
  const complete = missing === 0;
  const next = nextState(state, published, complete ? build : state.steamBuild, removed, builder);
  await putObject(stateKey, Buffer.from(JSON.stringify(next)), 'application/json');
  process.stdout.write(
    `uploaded ${sent} (${(bytes / 1024 / 1024).toFixed(1)} MiB stored), unchanged ${plan.unchanged}, ` +
      `not produced ${missing}, stale ${plan.stale.length}${bare.has('prune') ? ' (pruned)' : ' (kept)'}\n`,
  );
} else {
  console.error('usage: publish.ts gate|state|push …');
  process.exit(2);
}
process.exit(0);

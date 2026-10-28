/**
 * Publish converted TF2 assets to the site's object storage, uploading only
 * what changed. Used by `.github/workflows/tf2-assets-sync.yml`; the Python
 * steps (`convert.py`, `hud.py`) do the conversion, this does the bucket side.
 *
 *   publish.ts check
 *       Writes, reads and deletes a tiny object; exits non-zero with a hint when the bucket is not writable.
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
import { deleteObject, getObject, putObject } from '../../lib/storage/s3.server';
import { encodeAsset } from '../../lib/tf2-loadout/asset-codec';
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
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.vtf': 'application/octet-stream',
  '.vmt': 'text/plain; charset=utf-8',
  '.res': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.menu': 'text/plain; charset=utf-8',
};

async function loadState(key: string) {
  // Only "no such object" means "nothing published yet" (getObject returns null for it). Any other
  // failure — a 403 from a mis-scoped token, a network error — must stop the run: treating it as an
  // empty state would re-convert and re-upload everything.
  const obj = await getObject(key);
  return parseState(obj ? obj.body.toString('utf8') : null);
}

function setOutput(name: string, value: string): void {
  process.stdout.write(`${name}=${value}\n`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

const builder = Number(flags.get('builder') ?? MODEL_BUILDER_VERSION);

if (cmd === 'check') {
  // Fail in seconds, before a 30 GB download, if the bucket cannot be written.
  const key = 'tf2-assets/_write-check';
  try {
    await putObject(key, Buffer.from('ok'), 'text/plain');
    const back = await getObject(key);
    if (back?.body.toString() !== 'ok') throw new Error('read-back did not match what was written');
    await deleteObject(key);
    process.stdout.write('storage: write, read and delete all work\n');
  } catch (e) {
    const err = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    console.error(
      `storage check failed: ${err.name ?? 'Error'} ${err.$metadata?.httpStatusCode ?? ''} ${err.message ?? ''}`,
    );
    console.error(
      'Check the repository secrets: S3_BUCKET must be the bucket the R2 token is scoped to, ' +
        'S3_ENDPOINT must be https://<account-id>.r2.cloudflarestorage.com (no bucket in the path), and the ' +
        'token (Cloudflare → R2 → Manage API tokens) needs Object Read & Write on that bucket.',
    );
    process.exit(1);
  }
} else if (cmd === 'gate') {
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
  let rawBytes = 0;
  let missing = 0;
  // A mutable asset index can only advertise files after all its dependencies exist.
  const index = flags.get('index');
  const queue = plan.upload.filter((w) => w.name !== index);
  const upload = async (w: { name: string; src: string }): Promise<void> => {
    const file = path.join(dir, w.name);
    if (!existsSync(file)) {
      missing++;
      return;
    }
    const raw = readFileSync(file);
    const ct = CONTENT_TYPE[path.extname(w.name).toLowerCase()] ?? 'application/octet-stream';
    const { body, contentEncoding } = encodeAsset(raw, ct);
    await putObject(prefix + w.name, body, ct, contentEncoding);
    rawBytes += raw.length;
    published[w.name] = { src: w.src, size: body.length };
    sent++;
    bytes += body.length;
  };
  const worker = async (): Promise<void> => {
    for (let w = queue.shift(); w; w = queue.shift()) {
      await upload(w);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  const indexUpload = plan.upload.find((w) => w.name === index);
  const preserve = flags.get('preserve-index');
  if (indexUpload && missing === 0 && preserve) {
    const errorsFile = path.join(dir, 'errors.json');
    const errors = existsSync(errorsFile)
      ? (JSON.parse(readFileSync(errorsFile, 'utf8')) as { id: number | string }[])
      : [];
    if (errors.length) {
      const old = await getObject(prefix + indexUpload.name);
      if (old) {
        const prior = JSON.parse(old.body.toString('utf8')) as Record<
          string,
          Record<string, unknown>
        >;
        const file = path.join(dir, indexUpload.name);
        const next = JSON.parse(readFileSync(file, 'utf8')) as Record<
          string,
          Record<string, unknown>
        >;
        for (const { id } of errors) {
          if (prior[preserve]?.[id] !== undefined && next[preserve]?.[id] === undefined) {
            next[preserve][id] = prior[preserve][id];
          }
        }
        writeFileSync(file, JSON.stringify(next));
      }
    }
  }
  if (indexUpload && missing === 0) await upload(indexUpload);

  let removed: string[] = [];
  if (bare.has('prune')) {
    // A model that failed to convert this run drops out of `wanted`; it is not gone, so keep it.
    const failedFile = path.join(dir, 'failed.json');
    const failed = new Set<string>(
      existsSync(failedFile) ? JSON.parse(readFileSync(failedFile, 'utf8')) : [],
    );
    removed = plan.stale.filter((n) => !failed.has(n));
    for (const name of removed) await deleteObject(prefix + name);
  }

  // Only advance the build id when everything wanted is now published, so a
  // partial failure is retried on the next run instead of being skipped.
  const complete = missing === 0;
  const next = nextState(state, published, complete ? build : state.steamBuild, removed, builder);
  await putObject(stateKey, Buffer.from(JSON.stringify(next)), 'application/json');
  process.stdout.write(
    `uploaded ${sent} (${(rawBytes / 1024 / 1024).toFixed(1)} MiB → ${(bytes / 1024 / 1024).toFixed(1)} MiB stored after Brotli), unchanged ${plan.unchanged}, ` +
      `not produced ${missing}, stale ${plan.stale.length}${bare.has('prune') ? ' (pruned)' : ' (kept)'}\n`,
  );
} else {
  console.error('usage: publish.ts gate|state|push …');
  process.exit(2);
}
process.exit(0);

/** Verify the production primary has every configured worker listening. */
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
if (existsSync('.output/server/worker.mjs')) {
  const state = JSON.parse(
    readFileSync(process.env.WEB_WORKER_STATE_FILE || join(tmpdir(), 'rmh-web-workers.json'), 'utf8'),
  );
  const expected = Number.parseInt(process.env.NITRO_CLUSTER_WORKERS || '2', 10);
  if (state.expected !== expected || state.listening !== expected) {
    throw new Error(`Only ${state.listening}/${expected} web workers are listening`);
  }
}

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { once } from 'node:events';
import { recordRelease } from '../../deploy/release-state.mjs';

const secret = 'release-webhook-test-secret';
const sha = 'b'.repeat(40);
const web = `sha256:${'a'.repeat(64)}`;
let child: ChildProcessWithoutNullStreams;
let directory: string;
let url: string;
beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'rmh-webhook-'));
  const script = join(directory, 'deploy.sh');
  writeFileSync(
    script,
    '#!/bin/bash\nprintf "%s|%s|%s\\n" "$DEPLOY_RELEASE_ID" "$2" "$RELEASE_EXPECT_WEB_DIGEST" >> "$(dirname "$0")/requests"\nprintf "%s" "$PATH" > "$(dirname "$0")/path"\n',
  );
  mkdirSync(join(directory, 'releases'));
  child = spawn(process.execPath, [resolve('webhook-server.cjs')], {
    env: {
      ...process.env,
      WEBHOOK_SECRET: secret,
      WEBHOOK_PORT: '0',
      DEPLOY_SCRIPT: script,
      DEPLOY_PROJECT_DIR: directory,
      WEBHOOK_LOG_FILE: join(directory, 'listener.log'),
      DEPLOY_STATE_DIR: join(directory, 'releases'),
      DEPLOY_SHELL: process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash',
    },
    stdio: 'pipe',
  });
  url = await new Promise<string>((done, reject) => {
    const timeout = setTimeout(() => reject(new Error('Listener did not start')), 5000);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Listener exited ${code}`));
    });
    child.stdout.on('data', (data) => {
      const match = String(data).match(/listening on 127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        done(`http://127.0.0.1:${match[1]}/webhook`);
      }
    });
  });
});
afterAll(async () => {
  if (child && child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
  if (directory) rmSync(directory, { recursive: true, force: true });
});
async function post(payload: unknown, validSignature = true) {
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', validSignature ? secret : 'wrong')
    .update(body)
    .digest('hex');
  return fetch(url, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': `sha256=${signature}` },
  });
}
function release(id: string) {
  return { release_id: id, ref: 'refs/heads/main', after: sha, images: { web, full: web } };
}

describe('signed release handoff', () => {
  it('rejects bad signatures, invalid object shapes and missing approved identities', async () => {
    expect((await post(release('release-unsigned'), false)).status).toBe(401);
    expect((await post(null)).status).toBe(400);
    expect((await post({ ...release('release-short'), after: sha.slice(0, 7) })).status).toBe(400);
    expect((await post({ ...release('release-no-images'), images: {} })).status).toBe(400);
  });
  it('launches the approved SHA and digests once for duplicate webhook requests', async () => {
    const body = release('release-once');
    expect((await post(body)).status).toBe(202);
    expect((await post(body)).status).toBe(202);
    expect((await post({ ...body, after: 'c'.repeat(40) })).status).toBe(409);
    const file = join(directory, 'requests');
    for (let i = 0; i < 50 && !existsSync(file); i++)
      await new Promise((done) => setTimeout(done, 20));
    expect(readFileSync(file, 'utf8').trim().split('\n')).toEqual([`release-once|${sha}|${web}`]);
  });
  // deploy.sh shells out to `node` for the release journal. The listener used to
  // hand it a fixed PATH without node, so on a host with node outside /usr/bin
  // every release died at its first journal write ("node: command not found").
  it('runs the deployment with the listener\'s own node on PATH', async () => {
    expect((await post(release('release-path'))).status).toBe(202);
    const file = join(directory, 'path');
    for (let i = 0; i < 50 && !existsSync(file); i++)
      await new Promise((done) => setTimeout(done, 20));
    expect(readFileSync(file, 'utf8').split(delimiter)[0]).toBe(dirname(process.execPath));
  });
  it('reports durable host completion and does not replay a release after listener state was lost', async () => {
    recordRelease(join(directory, 'releases'), 'release-durable', sha, 'success');
    const response = await post({ action: 'status', release_id: 'release-durable' });
    expect(response.status).toBe(200);
    expect((await response.json()).phase).toBe('success');
    expect((await post(release('release-durable'))).status).toBe(202);
    expect((await post({ ...release('release-durable'), after: 'c'.repeat(40) })).status).toBe(409);
    expect((await post({ action: 'status', release_id: 'release-missing' })).status).toBe(404);
  });
});

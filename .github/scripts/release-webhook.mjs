/* eslint-disable no-console -- release lifecycle reporter */
import { createHmac } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function webhookRequest(payload, env = process.env) {
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', env.WEBHOOK_SECRET).update(body).digest('hex');
  const response = await fetch(env.DEPLOY_WEBHOOK_URL, {
    method: 'POST',
    body,
    signal: globalThis.AbortSignal.timeout(30_000),
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': `sha256=${signature}`,
      'X-Discord-Msg-Id': env.DISCORD_MSG_ID || '',
    },
  });
  const text = await response.text();
  if (!response.ok && response.status !== 404)
    throw new Error(`Release webhook returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  return { status: response.status, text };
}
async function main(action) {
  const id = `release-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
  if (action === 'trigger') {
    const result = await webhookRequest({
      ref: process.env.COMMIT_REF,
      after: process.env.COMMIT_SHA,
      release_id: id,
      images: { web: process.env.WEB_DIGEST, full: process.env.FULL_DIGEST },
    });
    if (result.status === 404) throw new Error('Deployment webhook was not found');
    console.log(`Release ${id} accepted. Host completion is reported separately.`);
    return;
  }
  if (action !== 'wait') throw new Error('Expected trigger or wait');
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const result = await webhookRequest({ action: 'status', release_id: id });
    if (result.status === 200) {
      let state;
      try {
        state = JSON.parse(result.text);
      } catch {
        throw new Error('Listener must be upgraded before enabling release completion tracking');
      }
      console.log(`Release ${id}: ${state.phase}`);
      if (['success', 'fail', 'rolledback', 'superseded'].includes(state.phase)) {
        if (process.env.GITHUB_STEP_SUMMARY) {
          const rows = state.events
            .map((event) => `| ${event.phase} | ${new Date(event.at).toISOString()} |`)
            .join('\n');
          appendFileSync(
            process.env.GITHUB_STEP_SUMMARY,
            `### Release ${id}\n\n| Phase | UTC |\n| --- | --- |\n${rows}\n`,
          );
        }
        if (state.phase !== 'success' && state.phase !== 'superseded')
          throw new Error(`Host release ended: ${state.phase}`);
        return;
      }
    }
    await new Promise((done) => setTimeout(done, 10_000));
  }
  throw new Error('Host release did not complete within 15 minutes');
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

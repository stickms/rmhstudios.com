/* eslint-disable no-console -- a CLI: stdout is its output */
/**
 * First-run setup for the Wiki.js instance behind wiki.rmhstudios.com, without
 * clicking through its setup wizard and admin area:
 *
 *   1. finish the setup wizard (creates the Wiki.js root administrator),
 *   2. sign in as that administrator,
 *   3. turn the API on,
 *   4. create the API key the site uses, and print it.
 *
 *   WIKIJS_URL=http://localhost:7010 \
 *   WIKIJS_ADMIN_EMAIL=you@example.com WIKIJS_ADMIN_PASSWORD='…' \
 *   pnpm wiki:bootstrap
 *
 * Put the printed key in the deploy env file as WIKIJS_API_KEY, restart web,
 * then `pnpm wiki:seed` (or the button on /admin/wiki). The key is shown once
 * and expires after three years; run this again to issue a new one (steps 1
 * and 3 are skipped when already done). Runbook: docs/wiki.md.
 *
 * The password is read from the environment, never from argv, so it does not
 * land in shell history or the process list.
 */
import 'dotenv/config';

const base = (process.env.WIKIJS_URL || 'http://localhost:7010').replace(/\/+$/, '');
const siteUrl = (process.env.WIKI_PUBLIC_URL || 'https://wiki.rmhstudios.com').replace(/\/+$/, '');
const email = process.env.WIKIJS_ADMIN_EMAIL ?? '';
const password = process.env.WIKIJS_ADMIN_PASSWORD ?? '';

function fail(message: string): never {
  console.error(`wiki bootstrap failed: ${message}`);
  process.exit(1);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * True once the full wiki is answering. The setup wizard answers every path,
 * /healthz included, with its HTML page and a 200, so the status alone says
 * nothing: only the real wiki returns the JSON body.
 */
async function wikiIsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(5_000) });
    const json = (await res.json()) as { ok?: boolean };
    return json.ok === true;
  } catch {
    return false;
  }
}

async function gql<T>(query: string, variables: object, token?: string): Promise<T> {
  const res = await fetch(`${base}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) fail(json.errors[0]!.message);
  if (!json.data) fail(`no data from ${base}/graphql (HTTP ${res.status})`);
  return json.data;
}

interface Result {
  responseResult: { succeeded: boolean; message: string | null };
}

async function main() {
  if (!email || !password) fail('set WIKIJS_ADMIN_EMAIL and WIKIJS_ADMIN_PASSWORD');
  if (password.length < 8) fail('Wiki.js needs a password of at least 8 characters');

  if (await wikiIsUp()) {
    console.log('setup wizard: already done');
  } else {
    const res = await fetch(`${base}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminEmail: email,
        adminPassword: password,
        adminPasswordConfirm: password,
        siteUrl,
        telemetry: false,
      }),
    }).catch((err: Error) => fail(`cannot reach ${base}: ${err.message}`));
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!json?.ok) fail(json?.error ?? `setup answered HTTP ${res.status}`);
    console.log('setup wizard: finished, waiting for the wiki to restart');
    // Wiki.js restarts itself into normal mode after the wizard.
    for (let i = 0; i < 60 && !(await wikiIsUp()); i++) await sleep(2_000);
    if (!(await wikiIsUp())) fail('the wiki did not come back after setup');
  }

  const login = await gql<{
    authentication: { login: Result & { jwt: string | null } };
  }>(
    `mutation ($username: String!, $password: String!) {
       authentication {
         login(username: $username, password: $password, strategy: "local") {
           responseResult { succeeded message }
           jwt
         }
       }
     }`,
    { username: email, password },
  );
  const token = login.authentication.login.jwt;
  if (!token) fail(login.authentication.login.responseResult.message ?? 'sign-in was refused');

  const state = await gql<{ authentication: { setApiState: Result } }>(
    `mutation { authentication { setApiState(enabled: true) { responseResult { succeeded message } } } }`,
    {},
    token,
  );
  if (!state.authentication.setApiState.responseResult.succeeded) fail('could not turn the API on');
  console.log('API: on');

  const created = await gql<{
    authentication: { createApiKey: Result & { key: string | null } };
  }>(
    `mutation {
       authentication {
         createApiKey(name: "rmhstudios.com admin", expiration: "3y", fullAccess: true) {
           responseResult { succeeded message }
           key
         }
       }
     }`,
    {},
    token,
  );
  const key = created.authentication.createApiKey.key;
  if (!key) fail(created.authentication.createApiKey.responseResult.message ?? 'no key returned');

  console.log('\nAPI key (shown once; set it as WIKIJS_API_KEY):\n');
  console.log(key);
}

void main();
